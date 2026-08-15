module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          // No `root` option -- it enables resolving *unprefixed* imports relative to
          // that root (e.g. `firebase/functions` treated as `<root>/firebase/functions`),
          // which silently shadowed the real `firebase` npm package's own `firebase/functions`
          // subpath with this repo's own `firebase/functions/` Cloud Functions folder (same
          // relative path, totally different thing) -- rewriting the import to a relative
          // path Metro then couldn't resolve ("Unable to resolve module firebase/auth" /
          // "../../firebase/functions/lib"). This project only ever uses the `@/` alias
          // below, never unprefixed root-relative imports, so `root` isn't needed.
          alias: { '@': './src' },
        },
      ],
    ],
  };
};
