export const STDB_HOST: string =
  import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
export const STDB_DB_NAME: string =
  import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'coop-builder';

/** `?slot=N` gives a tab its own saved identity and name, for several players in one browser. */
const slot = new URLSearchParams(location.search).get('slot');
export const STORAGE_SUFFIX = slot ? `#${slot}` : '';
