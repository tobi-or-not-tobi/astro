import _path from 'path';
import { compile as compilePathToRegexp } from 'path-to-regexp';
import type { ServerRuntime as SnowpackServerRuntime } from 'snowpack';
import { fileURLToPath } from 'url';
import type { AstroConfig, BuildOutput, GetStaticPathsResult, Params, RouteData, RuntimeMode } from '../@types/astro';
import type { LogOptions } from '../logger';
import type { AstroRuntime, LoadResult } from '../runtime';
import { convertMatchToLocation, generatePaginateFunction } from '../util.js';
// import { validateCollectionModule, validateCollectionResult } from '../util.js';
import { generateRSS } from './rss.js';

interface PageBuildOptions {
  astroConfig: AstroConfig;
  buildState: BuildOutput;
  logging: LogOptions;
  path: string;
  route: RouteData;
  params?: Params;
  mode: RuntimeMode;
  snowpackRuntime: SnowpackServerRuntime;
  astroRuntime: AstroRuntime;
  site?: string;
}

/** Collection utility */
export function getPageType(filepath: URL): 'collection' | 'static' {
  if (/\$[^.]+.astro$/.test(filepath.pathname)) return 'collection';
  return 'static';
}

/** Build collection */
// export async function buildDynamicPage({ astroConfig, filepath, astroRuntime, snowpackRuntime, site, buildState }: PageBuildOptions): Promise<void> {
//   const { pages: pagesRoot } = astroConfig;
//   const srcURL = filepath.pathname.replace(pagesRoot.pathname, '');
//   const pagesPath = astroConfig.pages.pathname.replace(astroConfig.projectRoot.pathname, '');
//   const snowpackURL = `/_astro/${pagesPath}${srcURL}.js`;
//   const mod = await snowpackRuntime.importModule(snowpackURL);
//   // validateCollectionModule(mod, filepath.pathname);
//   const pageCollection: any = await mod.exports.createCollection();
//   // validateCollectionResult(pageCollection, filepath.pathname);
//   let { route, paths: getPaths = () => [{ params: {} }] } = pageCollection;
//   const toPath = compilePathToRegexp(route);
//   const allPaths = getPaths();
//   const allRoutes: string[] = allPaths.map((p: any) => toPath(p.params));

//   // Keep track of all files that have been built, to prevent duplicates.
//   const builtURLs = new Set<string>();

//   /** Recursively build collection URLs */
//   async function loadPage(url: string): Promise<{ url: string; result: LoadResult } | undefined> {
//     if (builtURLs.has(url)) {
//       return;
//     }
//     builtURLs.add(url);
//     const result = await astroRuntime.load(url);
//     if (result.statusCode === 200) {
//       const outPath = _path.posix.join(url, '/index.html');
//       buildState[outPath] = {
//         srcPath: filepath,
//         contents: result.contents,
//         contentType: 'text/html',
//         encoding: 'utf8',
//       };
//     }
//     return { url, result };
//   }

//   const loadResults = await Promise.all(allRoutes.map(loadPage));
//   for (const loadResult of loadResults) {
//     if (!loadResult) {
//       continue;
//     }
//     const result = loadResult.result;
//     if (result.statusCode >= 500) {
//       throw new Error((result as any).error);
//     }
//     if (result.statusCode === 200) {
//       const { collectionInfo } = result;
//       if (collectionInfo?.rss) {
//         if (!site) {
//           throw new Error(`[${srcURL}] createCollection() tried to generate RSS but "buildOptions.site" missing in astro.config.mjs`);
//         }
//         const feedURL = '/feed' + loadResult.url + '.xml';
//         const rss = generateRSS({ ...(collectionInfo.rss as any), site }, { srcFile: srcURL, feedURL });
//         buildState[feedURL] = {
//           srcPath: filepath,
//           contents: rss,
//           contentType: 'application/rss+xml',
//           encoding: 'utf8',
//         };
//       }
//       if (collectionInfo?.additionalURLs) {
//         await Promise.all([...collectionInfo.additionalURLs].map(loadPage));
//       }
//     }
//   }
// }

/** Build dynamic page */
export async function buildDynamicPage({
  astroConfig,
  snowpackRuntime,
  route,
}: {
  astroConfig: AstroConfig;
  route: RouteData;
  snowpackRuntime: SnowpackServerRuntime;
}): Promise<string[]> {
  const location = convertMatchToLocation(route, astroConfig);
  const mod = await snowpackRuntime.importModule(location.snowpackURL);
  const paginateFn = generatePaginateFunction(route);
  const routePathParams: GetStaticPathsResult = await mod.exports.getStaticPaths({ paginate: paginateFn });
  console.log('routePathParams', routePathParams);
  return routePathParams.map((staticPath) => route.generate(staticPath.params));

  // const result = await astroRuntime.load(route.path);
  // if (result.statusCode !== 200) {
  //   let err = (result as any).error;
  //   if (!(err instanceof Error)) err = new Error(err);
  //   err.filename = fileURLToPath(location.fileURL);
  //   throw err;
  // }
  // const outFile = _path.posix.join(route.path, '/index.html');
  // buildState[outFile] = {
  //   srcPath: location.fileURL,
  //   contents: result.contents,
  //   contentType: 'text/html',
  //   encoding: 'utf8',
  // };
  // return true;
}

/** Build static page */
export async function buildStaticPage({ astroConfig, buildState, path, route, astroRuntime }: PageBuildOptions): Promise<boolean> {
  console.log('BUILDING', path);
  const location = convertMatchToLocation(route, astroConfig);
  const result = await astroRuntime.load(path);
  if (result.statusCode !== 200) {
    let err = (result as any).error;
    if (!(err instanceof Error)) err = new Error(err);
    err.filename = fileURLToPath(location.fileURL);
    throw err;
  }
  const outFile = _path.posix.join(path, '/index.html');
  buildState[outFile] = {
    srcPath: location.fileURL,
    contents: result.contents,
    contentType: 'text/html',
    encoding: 'utf8',
  };
  return true;
}
