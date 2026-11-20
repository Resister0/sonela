-- Sonela daily counts (D1 database "sonela-stats", bound as STATS in wrangler.toml). Numbers only: no IP, no ID,
-- nothing about one person. kind: download (sonela.app download links) | install (an app's first start) | user (an
-- app copy used that day - one ping a day at most). os: windows | linux | other, or the download button's name.
--   npx wrangler d1 execute sonela-stats --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS daily (
  day TEXT NOT NULL,
  app TEXT NOT NULL,
  kind TEXT NOT NULL,
  os TEXT NOT NULL,
  version TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, kind, os, version)
);
