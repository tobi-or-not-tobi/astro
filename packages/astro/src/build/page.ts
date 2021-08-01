import _path from 'path';
import type { ServerRuntime as SnowpackServerRuntime } from 'snowpack';
import { fileURLToPath } from 'url';
import type { AstroConfig, BuildOutput, GetStaticPathsResult, RouteData } from '../@types/astro';
import type { AstroRuntime } from '../runtime';
import { convertMatchToLocation, generatePaginateFunction } from '../util.js';

interface PageBuildOptions {
  astroConfig: AstroConfig;
  buildState: BuildOutput;
  path: string;
  route: RouteData;
  astroRuntime: AstroRuntime;
}

/** Build dynamic page */
export async function getPathsForDynamicPage({
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
  return routePathParams.map((staticPath) => route.generate(staticPath.params));
}

/** Build static page */
export async function buildStaticPage({ astroConfig, buildState, path, route, astroRuntime }: PageBuildOptions): Promise<void> {
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
}
