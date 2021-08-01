import { RouteData, ManifestData } from '../@types/astro';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import mime from 'mime';
import slash from 'slash';
import glob from 'tiny-glob/sync.js';
import { AstroConfig } from '../@types/astro';
import stringWidth from 'string-width';
import { compile } from 'path-to-regexp';
interface Part {
  content: string;
  dynamic: boolean;
  spread: boolean;
}

interface Item {
  basename: string;
  ext: string;
  parts: Part[];
  file: string;
  is_dir: boolean;
  is_index: boolean;
  is_page: boolean;
  route_suffix: string;
}

const specials = new Set(['__layout', '__layout.reset', '__error']);

export function create_manifest_data({ config, cwd }: { config: AstroConfig; cwd?: string }): ManifestData {
  const components: string[] = [];
  const routes: RouteData[] = [];

  /**
   * @param {string} dir
   * @param {Part[][]} parent_segments
   * @param {string[]} parent_params
   */
  function walk(dir: string, parent_segments: Part[][], parent_params: string[]) {
    let items: Item[] = [];
    fs.readdirSync(dir).forEach((basename) => {
      const resolved = path.join(dir, basename);
      const file = slash(path.relative(cwd || fileURLToPath(config.projectRoot), resolved));
      const is_dir = fs.statSync(resolved).isDirectory();

      const ext = path.extname(basename);
      const name = ext ? basename.slice(0, -ext.length) : basename;

      if (basename[0] === '.' && basename !== '.well-known') return null;
      if (!is_dir && !/^(\.[a-z0-9]+)+$/i.test(ext)) return null; // filter out tmp files etc

      const segment = is_dir ? basename : name;

      if (/\]\[/.test(segment)) {
        throw new Error(`Invalid route ${file} — parameters must be separated`);
      }

      if (count_occurrences('[', segment) !== count_occurrences(']', segment)) {
        throw new Error(`Invalid route ${file} — brackets are unbalanced`);
      }

      if (/.+\[\.\.\.[^\]]+\]/.test(segment) || /\[\.\.\.[^\]]+\].+/.test(segment)) {
        throw new Error(`Invalid route ${file} — rest parameter must be a standalone segment`);
      }

      const parts = get_parts(segment, file);
      const is_index = is_dir ? false : basename.startsWith('index.');
      const route_suffix = basename.slice(basename.indexOf('.'), -ext.length);

      items.push({
        basename,
        ext,
        parts,
        file: slash(file),
        is_dir,
        is_index,
        is_page: true,
        route_suffix,
      });
    });
    items = items.sort(comparator);

    items.forEach((item) => {
      const segments = parent_segments.slice();

      if (item.is_index) {
        if (item.route_suffix) {
          if (segments.length > 0) {
            const last_segment = segments[segments.length - 1].slice();
            const last_part = last_segment[last_segment.length - 1];

            if (last_part.dynamic) {
              last_segment.push({
                dynamic: false,
                spread: false,
                content: item.route_suffix,
              });
            } else {
              last_segment[last_segment.length - 1] = {
                dynamic: false,
                spread: false,
                content: `${last_part.content}${item.route_suffix}`,
              };
            }

            segments[segments.length - 1] = last_segment;
          } else {
            segments.push(item.parts);
          }
        }
      } else {
        segments.push(item.parts);
      }

      const params = parent_params.slice();
      params.push(...item.parts.filter((p) => p.dynamic).map((p) => p.content));

      if (item.is_dir) {
        walk(path.join(dir, item.basename), segments, params);
      } else if (item.is_page) {
        components.push(item.file);
        const component = item.file;
        const pattern = get_pattern(segments, false);
        const generate = get_generator(segments, false);
        const path = segments.every((segment) => segment.length === 1 && !segment[0].dynamic) ? `/${segments.map((segment) => segment[0].content).join('/')}` : null;

        routes.push({
          type: 'page',
          pattern,
          params,
          component,
          generate,
          // @ts-expect-error
          path,
        });
      } else {
        throw new Error('NOT IMPLEMENTED');
        // 	const pattern = get_pattern(segments, !item.route_suffix);
        // 	routes.push({
        // 		type: 'endpoint',
        // 		pattern,
        // 		file: item.file,
        // 		params
        // 	});
      }
    });
  }

  walk(fileURLToPath(config.pages), [], []);

  return {
    routes,
  };
}

function count_occurrences(needle: string, haystack: string) {
  let count = 0;
  for (let i = 0; i < haystack.length; i += 1) {
    if (haystack[i] === needle) count += 1;
  }
  return count;
}

function is_spread(path: string) {
  const spread_pattern = /\[\.{3}/g;
  return spread_pattern.test(path);
}

function comparator(a: Item, b: Item) {
  if (a.is_index !== b.is_index) {
    if (a.is_index) return is_spread(a.file) ? 1 : -1;

    return is_spread(b.file) ? -1 : 1;
  }

  const max = Math.max(a.parts.length, b.parts.length);

  for (let i = 0; i < max; i += 1) {
    const a_sub_part = a.parts[i];
    const b_sub_part = b.parts[i];

    if (!a_sub_part) return 1; // b is more specific, so goes first
    if (!b_sub_part) return -1;

    // if spread && index, order later
    if (a_sub_part.spread && b_sub_part.spread) {
      return a.is_index ? 1 : -1;
    }

    // If one is ...spread order it later
    if (a_sub_part.spread !== b_sub_part.spread) return a_sub_part.spread ? 1 : -1;

    if (a_sub_part.dynamic !== b_sub_part.dynamic) {
      return a_sub_part.dynamic ? 1 : -1;
    }

    if (!a_sub_part.dynamic && a_sub_part.content !== b_sub_part.content) {
      return b_sub_part.content.length - a_sub_part.content.length || (a_sub_part.content < b_sub_part.content ? -1 : 1);
    }
  }

  if (a.is_page !== b.is_page) {
    return a.is_page ? 1 : -1;
  }

  // otherwise sort alphabetically
  return a.file < b.file ? -1 : 1;
}

function get_parts(part: string, file: string) {
  const result: Part[] = [];
  part.split(/\[(.+?\(.+?\)|.+?)\]/).map((str, i) => {
    if (!str) return;
    const dynamic = i % 2 === 1;

    const [, content] = dynamic ? /([^(]+)$/.exec(str) || [null, null] : [null, str];

    if (!content || (dynamic && !/^(\.\.\.)?[a-zA-Z0-9_$]+$/.test(content))) {
      throw new Error(`Invalid route ${file} — parameter name must match /^[a-zA-Z0-9_$]+$/`);
    }

    result.push({
      content,
      dynamic,
      spread: dynamic && /^\.{3}.+$/.test(content),
    });
  });

  return result;
}

function get_pattern(segments: Part[][], add_trailing_slash: boolean) {
  const path = segments
    .map((segment) => {
      return segment[0].spread
        ? '(?:\\/(.*))?'
        : '\\/' +
            segment
              .map((part) => {
                if (part)
                  return part.dynamic
                    ? '([^/]+?)'
                    : part.content
                        .normalize()
                        .replace(/\?/g, '%3F')
                        .replace(/#/g, '%23')
                        .replace(/%5B/g, '[')
                        .replace(/%5D/g, ']')
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              })
              .join('');
    })
    .join('');

  const trailing = add_trailing_slash && segments.length ? '\\/?$' : '$';

  return new RegExp(`^${path || '\\/'}${trailing}`);
}

function get_generator(segments: Part[][], add_trailing_slash: boolean) {
  console.log(segments);
  const template = segments
    .map((segment) => {
      return segment[0].spread
        ? `/:${segment[0].content.substr(3)}*`
        : '/' +
            segment
              .map((part) => {
                if (part)
                  return part.dynamic
                    ? `:${part.content}`
                    : part.content
                        .normalize()
                        .replace(/\?/g, '%3F')
                        .replace(/#/g, '%23')
                        .replace(/%5B/g, '[')
                        .replace(/%5D/g, ']')
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              })
              .join('');
    })
    .join('');

  const trailing = add_trailing_slash && segments.length ? '/' : '';
  console.log({ template, trailing, compile: compile(template + trailing) });

  const toPath = compile(template + trailing);
  return (dirtyParams: any) => {
    const cleanParams = Object.fromEntries(Object.entries(dirtyParams).filter(([k, v]) => v && v.length > 0));
    console.log({ template, cleanParams, dirtyParams, result: toPath(cleanParams) });
    return toPath(cleanParams);
  };
}
