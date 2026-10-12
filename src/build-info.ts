declare const __APP_BUILD__: {revision:string;dirty:boolean};
declare const __BENCHMARK_BUILD__: {revision:string;dirty:boolean};
export const BUILD_INFO=typeof __APP_BUILD__!=='undefined' ? __APP_BUILD__ : typeof __BENCHMARK_BUILD__!=='undefined' ? __BENCHMARK_BUILD__ : null;
