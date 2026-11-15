'use client';

// No Time German: the Publish page (/publish). The posts as a list grouped by day, like Buffer's Publish page: tabs
// Queue / Drafts / Sent / Failed with their counts, channel and customer filters, and a card per post with its
// channel, text, media and actions. Built on the calendar's list mode (CalendarWeekProvider with `listOnly`) and its
// post actions (usePostActions), so editing, duplicating and deleting work exactly as in the calendar. Phone-first:
// one column, filters in a bottom sheet, large tap targets.
import { CSSProperties, FC, ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import useSWR from 'swr';
import { orderBy } from 'lodash';
import {
  CalendarWeekProvider,
  ListStateFilter,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import { usePostActions } from '@gitroom/frontend/components/launches/calendar';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { NewPost } from '@gitroom/frontend/components/launches/new.post';
import { SelectCustomer } from '@gitroom/frontend/components/launches/select.customer';
import { SelectChannels } from '@gitroom/frontend/components/launches/select.channels';
import { BottomSheet } from '@gitroom/frontend/components/ui/bottom.sheet.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { fromUtc, newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { isUSCitizen } from '@gitroom/frontend/components/launches/helpers/isuscitizen.utils';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type Tab = Exclude<ListStateFilter, 'all'>;
type Counts = Record<Tab, number>;

export const PublishComponent = () => {
  const { isLoading, data: integrations } = useIntegrationList();
  // the same channel order as the calendar
  const sortedIntegrations = useMemo(
    () =>
      orderBy(
        integrations,
        ['type', 'disabled', 'identifier'],
        ['desc', 'asc', 'asc']
      ),
    [integrations]
  );

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <CalendarWeekProvider
      integrations={sortedIntegrations}
      listOnly={{ path: '/publish', initialState: 'scheduled' }}
    >
      <PublishView />
    </CalendarWeekProvider>
  );
};

// The tab counts: { scheduled, draft, published, error } for the given customer and channel filters.
const usePostsListCounts = (params: string) => {
  const fetch = useFetch();
  return useSWR<Counts>(
    `/posts/list/counts?${params}`,
    async (path: string) => (await fetch(path)).json(),
    { revalidateOnFocus: false }
  );
};

const PublishView = () => {
  const t = useT();
  const calendar = useCalendar();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The tab counts, with the same customer and channel filters as the list.
  const countsParams = useMemo(
    () =>
      new URLSearchParams({
        customer: calendar.customer || '',
        ...(calendar.selectedChannels
          ? { integrations: calendar.selectedChannels.join(',') }
          : {}),
      }).toString(),
    [calendar.customer, calendar.selectedChannels]
  );
  const { data: counts, mutate: reloadCounts } = usePostsListCounts(countsParams);
  // Anything that changes the list (edit, delete, duplicate, a new post) changes the counts too.
  useEffect(() => {
    reloadCounts();
  }, [calendar.listPosts]);

  const tabs: { value: Tab; label: string }[] = [
    { value: 'scheduled', label: t('queue', 'Queue') },
    { value: 'draft', label: t('drafts', 'Drafts') },
    { value: 'published', label: t('sent', 'Sent') },
    { value: 'error', label: t('failed', 'Failed') },
  ];

  const setCustomer = (customer: string) => {
    if (calendar.customer === customer) return;
    calendar.setFilters({
      startDate: calendar.startDate,
      endDate: calendar.endDate,
      display: 'list',
      customer,
    });
  };

  return (
    <div className="bg-newBgColorInner flex-1 min-w-0 flex flex-col p-[20px] mobile:p-[12px] gap-[16px] mobile:gap-[12px] text-textColor">
      <div className="flex items-center gap-[8px] flex-wrap">
        {/* on a phone the four tabs share the width, each with its count under the label */}
        <div className="flex mobile:grid mobile:grid-cols-4 p-[4px] border border-newTableBorder rounded-[8px] text-[14px] mobile:text-[13px] font-[500] mobile:order-2 mobile:basis-full">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => calendar.setListState(tab.value)}
              className={clsx(
                'flex items-center gap-[6px] whitespace-nowrap px-[12px] min-h-[36px] rounded-[6px] mobile:flex-col mobile:justify-center mobile:gap-[2px] mobile:px-[2px] mobile:py-[6px] mobile:min-h-[52px]',
                calendar.listState === tab.value
                  ? 'text-textItemFocused bg-boxFocused'
                  : 'hover:text-textItemFocused'
              )}
            >
              {tab.label}
              <span
                className={clsx(
                  'text-[12px] rounded-full px-[7px] min-w-[22px] leading-[20px] text-center',
                  tab.value === 'error' && counts?.error
                    ? 'bg-red-500 text-white'
                    : calendar.listState === tab.value
                    ? 'bg-[#612BD3] text-white'
                    : 'bg-newTableBorder'
                )}
              >
                {counts ? counts[tab.value] : '…'}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1 mobile:hidden" />
        <div className="contents mobile:hidden">
          <SelectCustomer
            customer={calendar.customer as string}
            onChange={setCustomer}
            integrations={calendar.integrations}
          />
          <SelectChannels />
        </div>
        <div className="flex items-center gap-[8px] mobile:order-1 mobile:w-full">
          {calendar.integrations.length > 1 && (
            <button
              onClick={() => setFiltersOpen(true)}
              aria-label={t('filters', 'Filters')}
              className={clsx(
                'hidden mobile:flex relative w-[44px] h-[44px] rounded-[8px] border justify-center items-center',
                calendar.selectedChannels || calendar.customer
                  ? 'border-[#612BD3] text-[#612BD3]'
                  : 'border-newTableBorder'
              )}
            >
              <FilterSvg />
              {(calendar.selectedChannels || calendar.customer) && (
                <div className="absolute top-[6px] end-[6px] w-[6px] h-[6px] rounded-full bg-[#612BD3]" />
              )}
            </button>
          )}
          <Link
            href="/launches"
            title={t('calendar', 'Calendar')}
            className="h-[44px] px-[12px] rounded-[8px] border border-newTableBorder flex items-center gap-[6px] text-[14px] font-[500] hover:text-textItemFocused hover:bg-boxFocused"
          >
            <CalendarSvg />
            <span className="mobile:hidden">{t('calendar', 'Calendar')}</span>
          </Link>
          {calendar.integrations.length > 0 && (
            <div className="flex mobile:flex-1">
              <NewPost />
            </div>
          )}
        </div>
      </div>

      <PostList />

      {filtersOpen && (
        <BottomSheet
          title={t('filters', 'Filters')}
          onClose={() => setFiltersOpen(false)}
          button={{
            label: t('done', 'Done'),
            onClick: () => setFiltersOpen(false),
          }}
        >
          <SelectCustomer
            list={true}
            customer={calendar.customer as string}
            onChange={setCustomer}
            integrations={calendar.integrations}
          />
          <SelectChannels list={true} />
        </BottomSheet>
      )}
    </div>
  );
};

// "Today", "Tomorrow", "Yesterday", else the weekday and date.
const dayLabel = (key: string, t: ReturnType<typeof useT>) => {
  const day = newDayjs(key);
  const today = newDayjs().startOf('day');
  const diff = day.startOf('day').diff(today, 'day');
  const date = day.format(isUSCitizen() ? 'dddd, MMMM D' : 'dddd, D MMMM');
  const withYear = day.year() !== today.year() ? `${date} ${day.year()}` : date;
  if (diff === 0) return `${t('today', 'Today')}, ${withYear}`;
  if (diff === 1) return `${t('tomorrow', 'Tomorrow')}, ${withYear}`;
  if (diff === -1) return `${t('yesterday', 'Yesterday')}, ${withYear}`;
  return withYear;
};

const PostList = () => {
  const t = useT();
  const user = useUser();
  const calendar = useCalendar();
  const actions = usePostActions();
  const { listPosts, listState, loading } = calendar;

  // Posts by their day in the user's timezone, in the order the server sent them (soonest first for the queue and
  // drafts, newest first for sent and failed).
  const groups = useMemo(() => {
    const byDay = new Map<string, any[]>();
    for (const post of listPosts) {
      const key = fromUtc(post.publishDate).format('YYYY-MM-DD');
      byDay.set(key, [...(byDay.get(key) || []), post]);
    }
    return [...byDay.entries()];
  }, [listPosts]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-[40px]">
        <LoadingComponent />
      </div>
    );
  }

  if (!listPosts.length) {
    const empty: Record<string, string> = {
      scheduled: t('no_upcoming_posts', 'No upcoming posts scheduled'),
      draft: t('no_draft_posts', 'No draft posts'),
      published: t('no_published_posts', 'No published posts'),
      error: t('no_failed_posts', 'No failed posts'),
    };
    return (
      <div className="flex flex-1 items-center justify-center py-[60px] text-[16px] text-center">
        {empty[listState] || t('no_posts', 'No posts')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[24px] mobile:gap-[20px] max-w-[900px] w-full mx-auto">
      {groups.map(([key, posts]) => (
        <div key={key} className="flex flex-col gap-[12px]">
          <h2 className="text-[18px] mobile:text-[16px] font-[600] sticky top-0 z-[1] bg-newBgColorInner py-[4px]">
            {dayLabel(key, t)}
          </h2>
          {posts.map((post) => (
            <div key={post.id} className="flex gap-[16px] mobile:flex-col mobile:gap-[6px]">
              <div className="w-[80px] shrink-0 pt-[14px] text-[14px] font-[600] mobile:hidden">
                {fromUtc(post.publishDate).format(isUSCitizen() ? 'h:mm A' : 'HH:mm')}
              </div>
              <PostCard post={post} actions={actions} isSuperAdmin={!!user?.isSuperAdmin} />
            </div>
          ))}
        </div>
      ))}
      {calendar.listTotalPages > 1 && (
        <div className="flex items-center justify-center gap-[12px] py-[8px] text-[14px]">
          <button
            disabled={calendar.listPage === 0}
            onClick={() => calendar.setListPage(calendar.listPage - 1)}
            className="min-h-[44px] px-[16px] rounded-[8px] border border-newTableBorder disabled:opacity-40"
          >
            {t('previous', 'Previous')}
          </button>
          <span>
            {calendar.listPage + 1} / {calendar.listTotalPages}
          </span>
          <button
            disabled={calendar.listPage >= calendar.listTotalPages - 1}
            onClick={() => calendar.setListPage(calendar.listPage + 1)}
            className="min-h-[44px] px-[16px] rounded-[8px] border border-newTableBorder disabled:opacity-40"
          >
            {t('next', 'Next')}
          </button>
        </div>
      )}
    </div>
  );
};

type Media = { path: string; thumbnail?: string; name?: string };
const isVideo = (path: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(path);

const PostCard: FC<{
  post: any;
  actions: ReturnType<typeof usePostActions>;
  isSuperAdmin: boolean;
}> = ({ post, actions, isSuperAdmin }) => {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Plain text with the post's line breaks: each paragraph (an empty one is a blank line) and <br> becomes a new line.
  const text = useMemo(
    () =>
      stripHtmlValidation(
        'none',
        (post.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n'),
        false,
        true,
        false
      ).trim(),
    [post.content]
  );
  const media: Media[] = useMemo(() => {
    try {
      return JSON.parse(post.image || '[]');
    } catch {
      return [];
    }
  }, [post.image]);
  const time = fromUtc(post.publishDate).format(isUSCitizen() ? 'h:mm A' : 'HH:mm');
  const long = text.length > 220 || text.split('\n').length > 4;
  const sent = post.state === 'PUBLISHED';
  const failed = post.state === 'ERROR';
  const canOpen = (sent || failed) && post.releaseURL?.startsWith('http');
  const hasStats = post.releaseId && post.releaseId !== 'missing';

  const menu: { label: string; onClick: () => void; danger?: boolean }[] = [
    { label: t('preview', 'Preview'), onClick: () => window.open(`/p/${post.id}?share=true`, '_blank') },
    { label: t('duplicate', 'Duplicate'), onClick: actions.editPost(post, true) },
    ...(canOpen ? [{ label: t('open_post', 'Open post'), onClick: actions.openPost(post) }] : []),
    ...(hasStats ? [{ label: t('statistics', 'Statistics'), onClick: actions.openStatistics(post.id) }] : []),
    ...(post.releaseId === 'missing'
      ? [{ label: t('connect_post', 'Connect Post'), onClick: actions.openMissingRelease(post.id) }]
      : []),
    ...(isSuperAdmin ? [{ label: t('copy_debug_json', 'Copy Debug JSON'), onClick: actions.copyDebugJson(post) }] : []),
    { label: t('delete', 'Delete'), onClick: actions.deletePost(post), danger: true },
  ];

  return (
    <div
      className={clsx(
        'flex-1 min-w-0 rounded-[12px] border bg-newColColor flex flex-col',
        failed ? 'border-red-500' : 'border-newTableBorder'
      )}
    >
      <div className="flex gap-[16px] p-[16px] mobile:p-[12px] mobile:flex-col mobile:gap-[12px]">
        <div className="flex-1 min-w-0 flex flex-col gap-[10px]">
          <div className="flex items-center gap-[10px] min-w-0">
            <div className="relative shrink-0">
              <img
                className="w-[36px] h-[36px] rounded-full object-cover"
                src={post.integration?.picture || '/no-picture.jpg'}
                alt=""
              />
              <img
                className="w-[16px] h-[16px] rounded-full absolute -bottom-[2px] -end-[2px] border border-newColColor"
                src={`/icons/platforms/${post.integration?.providerIdentifier}.png`}
                alt={post.integration?.providerIdentifier}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-[600] truncate">{post.integration?.name}</div>
              <div className="flex items-center gap-[6px] flex-wrap text-[12px] text-textColor/60">
                {/* on a phone the time sits here, since there is no time column */}
                <span className="hidden mobile:inline font-[600] text-textColor">{time}</span>
                {post.state === 'DRAFT' && <Badge className="bg-newTableBorder">{t('draft', 'Draft')}</Badge>}
                {sent && <Badge className="bg-green-600 text-white">{t('published', 'Published')}</Badge>}
                {failed && <Badge className="bg-red-500 text-white">{t('failed', 'Failed')}</Badge>}
                {(post.tags || []).map(({ tag }: any) => (
                  <Badge key={tag.id} style={{ backgroundColor: tag.color }} className="text-white">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="text-[14px] leading-[1.5] whitespace-pre-wrap break-words">
            <div className={clsx(!expanded && long && 'line-clamp-4')}>
              {text || <span className="text-textColor/50">{t('no_content', 'no content')}</span>}
            </div>
            {long && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[13px] font-[600] text-textColor/70 hover:text-textItemFocused mt-[2px] min-h-[28px]"
              >
                {expanded ? t('see_less', 'see less') : t('see_more', 'see more')}
              </button>
            )}
          </div>
          {failed && (
            <div className="text-[13px] rounded-[8px] bg-red-500/10 text-red-500 px-[10px] py-[8px] break-words">
              {post.error || t('post_failed', 'An error occurred while publishing this post')}
            </div>
          )}
        </div>
        {media.length > 0 && <MediaThumb media={media} />}
      </div>
      <div className="flex items-center gap-[8px] border-t border-newTableBorder px-[16px] mobile:px-[12px] py-[8px]">
        <div className="flex-1" />
        <button
          onClick={actions.editPost(post, false)}
          className="min-h-[40px] px-[14px] rounded-[8px] border border-newTableBorder flex items-center gap-[6px] text-[14px] font-[500] hover:text-textItemFocused hover:bg-boxFocused"
        >
          <PencilSvg />
          {t('edit', 'Edit')}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t('more_actions', 'More actions')}
            className="min-h-[40px] min-w-[40px] rounded-[8px] border border-newTableBorder flex items-center justify-center hover:text-textItemFocused hover:bg-boxFocused"
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[10]" onClick={() => setMenuOpen(false)} />
              <div className="absolute end-0 bottom-[calc(100%+6px)] z-[11] min-w-[190px] rounded-[10px] border border-newTableBorder bg-newBgColorInner shadow-lg py-[6px] flex flex-col">
                {menu.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onClick();
                    }}
                    className={clsx(
                      'text-start px-[14px] min-h-[40px] text-[14px] hover:bg-boxFocused',
                      item.danger && 'text-red-500'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Badge: FC<{ children: ReactNode; className?: string; style?: CSSProperties }> = ({
  children,
  className,
  style,
}) => (
  <span style={style} className={clsx('rounded-[6px] px-[6px] leading-[18px] text-[11px] font-[600]', className)}>
    {children}
  </span>
);

// The first image or video, with "+N" when the post has more media. Beside the text on a computer, under it on a phone.
const MediaThumb: FC<{ media: Media[] }> = ({ media }) => {
  const first = media[0];
  const src = first.thumbnail || first.path;
  return (
    <div className="relative shrink-0 w-[140px] h-[140px] mobile:w-full mobile:h-auto mobile:max-h-[320px] mobile:aspect-[4/5] rounded-[10px] overflow-hidden bg-newTableBorder">
      {!first.thumbnail && isVideo(first.path) ? (
        <video
          src={`${first.path}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
      )}
      {isVideo(first.path) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[36px] h-[36px] rounded-full bg-black/60 text-white flex items-center justify-center text-[14px]">
            ▶
          </div>
        </div>
      )}
      {media.length > 1 && (
        <div className="absolute bottom-[6px] end-[6px] rounded-[6px] bg-black/70 text-white text-[12px] font-[600] px-[6px]">
          +{media.length - 1}
        </div>
      )}
    </div>
  );
};

const FilterSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const CalendarSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="19" viewBox="0 0 17 19" fill="none">
    <path
      d="M15.75 7.41667H0.75M11.5833 0.75V4.08333M4.91667 0.75V4.08333M4.75 17.4167H11.75C13.1501 17.4167 13.8502 17.4167 14.385 17.1442C14.8554 16.9045 15.2378 16.522 15.4775 16.0516C15.75 15.5169 15.75 14.8168 15.75 13.4167V6.41667C15.75 5.01654 15.75 4.31647 15.4775 3.78169C15.2378 3.31129 14.8554 2.92883 14.385 2.68915C13.8502 2.41667 13.1501 2.41667 11.75 2.41667H4.75C3.34987 2.41667 2.6498 2.41667 2.11502 2.68915C1.64462 2.92883 1.26217 3.31129 1.02248 3.78169C0.75 4.31647 0.75 5.01654 0.75 6.41667V13.4167C0.75 14.8168 0.75 15.5169 1.02248 16.0516C1.26217 16.522 1.64462 16.9045 2.11502 17.1442C2.6498 17.4167 3.34987 17.4167 4.75 17.4167Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4Z M13.5 6.5l4 4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
