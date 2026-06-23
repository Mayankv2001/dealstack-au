-- DealStack AU — hide specific staged feed items from the homepage Top 5
--
-- Adds a single additive flag so an admin can EXCLUDE a staged feed item from
-- the public homepage "Today's top OzBargain signals" list WITHOUT removing it
-- from the import queue or changing its moderation state. This migration only
-- adds a column — there is NO fetcher, cron, or agent here, and nothing makes an
-- external request or publishes anything.
--
-- Why a separate flag (and not review_state):
--   * The import queue (lib/admin/repos/feedQueue.listNewFeedItems) lists ONLY
--     review_state = 'new'. The homepage (lib/repos/topDeals.getTopDeals) shows
--     review_state IN ('new','imported'). Reusing 'ignored'/'duplicate' to hide
--     an item from the homepage would also pull it OUT of the import queue and
--     block importing it — i.e. it would change the import workflow.
--   * hidden_from_homepage is orthogonal to review_state: Import / Ignore / Mark
--     duplicate all behave exactly as before. This flag only gates homepage
--     visibility, and the homepage query already returns nothing on error, so
--     existing rows (default false) are unaffected.
--
-- Security posture unchanged: feed_items already has RLS enabled (default-deny,
-- service-role only) from migration 002. No policy changes here.

alter table feed_items
  add column if not exists hidden_from_homepage boolean not null default false;

comment on column feed_items.hidden_from_homepage is
  'Admin-set: exclude this item from the public homepage Top 5 only. Does NOT '
  'affect the import queue or review_state; Import/Ignore/Mark-duplicate are '
  'unaffected. Set via the admin signals queue, never by the fetcher.';

-- Supports the homepage read: newest visible items first. Partial index keeps it
-- small (only the rows the homepage can ever show).
create index if not exists idx_feed_items_homepage_visible
  on feed_items (fetched_at desc)
  where hidden_from_homepage = false;
