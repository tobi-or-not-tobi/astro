// import type { CreateCollectionResult } from './@types/astro';

import { AstroConfig, GetStaticPathsResult, RouteData } from './@types/astro';

interface PageLocation {
  fileURL: URL;
  snowpackURL: string;
}

/** convertMatchToLocation and return the _astro candidate for snowpack */
export function convertMatchToLocation(routeMatch: RouteData, astroConfig: AstroConfig): PageLocation {
  const url = new URL(`./${routeMatch.component}`, astroConfig.projectRoot);
  return {
    fileURL: url,
    snowpackURL: `/_astro/${routeMatch.component}.js`,
  };
}

export function generatePaginateFunction(routeMatch: RouteData) {
  let paginateCallCount = 0;
  return function paginateUtility(data: any[], args: { pageSize?: number; rss?: any } = {}) {
    if (paginateCallCount !== 0) {
      throw new Error('IMPROVE MSG - cannot call paginate() more than once.');
    }
    paginateCallCount++;
    let { pageSize: _pageSize, rss } = args;
    const pageSize = _pageSize || 10;
    // collectionInfo = {
    //   additionalURLs: new Set<string>(),
    //   rss: undefined,
    // };
    // if (rss) {
    //   collectionInfo.rss = {
    //     ...rss,
    //     data: [...data] as any,
    //   };
    // }

    const lastPage = Math.max(1, Math.ceil(data.length / pageSize));
    // console.log('PAGINATE', pageSize, data, lastPage);

    const result: GetStaticPathsResult = [...Array(lastPage).keys()].map((num) => {
      const pageNum = num + 1;
      const start = pageSize === Infinity ? 0 : (pageNum - 1) * pageSize; // currentPage is 1-indexed
      const end = Math.min(start + pageSize, data.length);
      const params = {
        page: pageNum > 1 ? String(pageNum) : '',
      };
      return {
        params,
        props: {
          page: {
            data: data.slice(start, end),
            start,
            end: end - 1,
            total: data.length,
            page: {
              size: pageSize,
              current: pageNum,
              last: lastPage,
            },
            // url: {
            //   current: `${rootPaginationUrl}${pageNum === 1 ? '' : '/' + pageNum}`,
            //   next: pageNum === lastPage ? undefined : `${rootPaginationUrl}/${pageNum + 1}`,
            //   prev: pageNum === 1 ? undefined : `${rootPaginationUrl}${pageNum === 2 ? '' : '/' + (pageNum - 1) }`,
            // },
            url: {
              current: routeMatch!.generate({ ...params }),
              next: pageNum === lastPage ? undefined : routeMatch!.generate({ ...params, page: String(pageNum + 1) }),
              prev: pageNum === 1 ? undefined : routeMatch!.generate({ ...params, page: pageNum - 1 === 1 ? undefined : String(pageNum - 1) }),
            },
          },
        },
      };
    });
    console.log(result, result[0].props!.page.url);
    return result;
  }
}

// export function validateCollectionModule(mod: any, filename: string) {
//   if (!mod.exports.createCollection) {
//     throw new Error(`No "createCollection()" export found. Add one or remove the "$" from the filename. ("${filename}")`);
//   }
// }
// export function validateCollectionResult(result: CreateCollectionResult, filename: string) {
//   const LEGACY_KEYS = new Set(['permalink', 'data', 'routes']);
//   for (const key of Object.keys(result)) {
//     if (LEGACY_KEYS.has(key)) {
//       throw new Error(`[deprecated] it looks like you're using the legacy createCollection() API. (key "${key}". (${filename})`);
//     }
//   }
//   const VALID_KEYS = new Set(['route', 'paths', 'props', 'paginate', 'rss']);
//   for (const key of Object.keys(result)) {
//     if (!VALID_KEYS.has(key)) {
//       throw new Error(`[createCollection] unknown option: "${key}". (${filename})`);
//     }
//   }
//   const REQUIRED_KEYS = new Set(['route', 'props']);
//   for (const key of REQUIRED_KEYS) {
//     if (!(result as any)[key]) {
//       throw new Error(`[createCollection] missing required option: "${key}". (${filename})`);
//     }
//   }
//   if (result.paginate && !result.route.includes(':page?')) {
//     throw new Error(`[createCollection] when "paginate: true" route must include a "/:page?" param. (${filename})`);
//   }
// }
