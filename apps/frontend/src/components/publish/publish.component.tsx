'use client';

// No Time German: the Publish page (/publish). The posts as a list grouped by day, like Buffer's Publish page: tabs
// Queue / Drafts / Sent / Failed with their counts, channel and customer filters, and a card per post with its
// channel, text, media and actions. Built on the calendar's list mode (CalendarWeekProvider with `listOnly`) and its
// post actions (usePostActions), so editing, duplicating and deleting work exactly as in the calendar. Phone-first:
// one column, filters in a bottom sheet, large tap targets. A search box finds posts by id, text, tag or channel name;
// the studio links to a post with ?q=<post id>, and the page opens on the tab that has it.
import { CSSProperties, FC, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { expandPostsList } from '@gitroom/helpers/utils/posts.list.minify';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

type Tab = Exclude<ListStateFilter, 'all'>;
// The tab counts, and the queued posts per channel (by integration id) for the channel list.
type Counts = Record<Tab, number> & { queuedByChannel?: Record<string, number> };
// Fixed, so the calendar context doesn't see a new value on every render.
const LIST_ONLY = { path: '/publish', initialState: 'scheduled' as const };

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
      listOnly={LIST_ONLY}
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

  // The tab counts, with the same customer, channel and search filters as the list.
  const countsParams = useMemo(
    () =>
      new URLSearchParams({
        customer: calendar.customer || '',
        ...(calendar.selectedChannels
          ? { integrations: calendar.selectedChannels.join(',') }
          : {}),
        ...(calendar.listSearch.trim() ? { search: calendar.listSearch.trim() } : {}),
      }).toString(),
    [calendar.customer, calendar.selectedChannels, calendar.listSearch]
  );
  const { data: counts, mutate: reloadCounts } = usePostsListCounts(countsParams);
  // Anything that changes the list (edit, delete, duplicate, a new post) changes the counts too.
  useEffect(() => {
    reloadCounts();
  }, [calendar.listPosts]);
  // Opened with a search (e.g. the studio's link to one post): if the tab it opened on has nothing, go to the first tab
  // that has a match. Only once, so choosing a tab afterwards is left alone.
  const openedWithSearch = useRef(!!calendar.listSearch);
  useEffect(() => {
    if (!openedWithSearch.current || !counts) return;
    openedWithSearch.current = false;
    if (counts[calendar.listState as Tab]) return;
    const found = tabsOrder.find((tab) => counts[tab]);
    if (found) calendar.setListState(found);
  }, [counts]);

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
    <div className="flex-1 min-w-0 flex gap-[1px] text-textColor h-[calc(100vh-105px)] mobile:h-auto">
      <ChannelSidebar queued={counts?.queuedByChannel} />
    <div className="bg-newBgColorInner flex-1 min-w-0 flex flex-col p-[20px] mobile:p-[12px] gap-[16px] mobile:gap-[12px] overflow-y-auto mobile:overflow-visible">
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

      <SearchBox />

      <ChannelStrip queued={counts?.queuedByChannel} />

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
    </div>
  );
};

const tabsOrder: Tab[] = ['scheduled', 'draft', 'published', 'error'];

// Finds posts by id, words in the text, a tag (e.g. a studio post tag like a2_vocabulary_de_to_en_60_video) or the
// channel name. The list follows after a short pause in typing.
const SearchBox = () => {
  const t = useT();
  const { listSearch, setListSearch } = useCalendar();
  const [value, setValue] = useState(listSearch);
  useEffect(() => {
    setValue(listSearch);
  }, [listSearch]);
  useEffect(() => {
    if (value === listSearch) return;
    const timer = setTimeout(() => setListSearch(value), 400);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <div className="relative max-w-[900px] w-full mx-auto">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setListSearch(value);
        }}
        placeholder={t('search_posts', 'Search posts: text, tag, channel or post id')}
        aria-label={t('search_posts', 'Search posts: text, tag, channel or post id')}
        className="w-full h-[44px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[12px] pe-[40px] text-[14px] outline-none focus:border-[#612BD3]"
      />
      {value && (
        <button
          onClick={() => {
            setValue('');
            setListSearch('');
          }}
          aria-label={t('clear', 'Clear')}
          className="absolute end-[4px] top-[4px] w-[36px] h-[36px] rounded-[6px] flex items-center justify-center hover:bg-boxFocused"
        >
          ✕
        </button>
      )}
    </div>
  );
};

// The channels to list: those of the chosen customer (all of them without one), grouped by customer like the
// calendar's channel list, enabled ones only.
const useChannelGroups = () => {
  const { integrations, customer } = useCalendar();
  return useMemo(() => {
    const shown = integrations.filter(
      (i) => !i.disabled && (!customer || i.customer?.id === customer)
    );
    const groups = new Map<string, { name: string; channels: typeof shown }>();
    for (const channel of shown) {
      const key = channel.customer?.id || '';
      const group = groups.get(key) || { name: channel.customer?.name || '', channels: [] };
      group.channels.push(channel);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [integrations, customer]);
};

// Clicking a channel shows only its posts; clicking it again (or "All channels") shows every channel again.
const useChannelChoice = () => {
  const { selectedChannels, setSelectedChannels } = useCalendar();
  const only = selectedChannels?.length === 1 ? selectedChannels[0] : null;
  return {
    only,
    all: !selectedChannels,
    // every chosen channel is marked, also when several were picked with the channel filter
    isChosen: (id: string) => !!selectedChannels?.includes(id),
    choose: (id: string | null) => setSelectedChannels(id && id !== only ? [id] : null),
  };
};

const ChannelAvatar: FC<{ channel: any; size: number }> = ({ channel, size }) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <img
      loading="lazy"
      className="w-full h-full rounded-full object-cover"
      src={channel.picture || '/no-picture.jpg'}
      alt=""
    />
    <img
      loading="lazy"
      className="w-[14px] h-[14px] rounded-full absolute -bottom-[2px] -end-[2px] border border-newBgColorInner"
      src={`/icons/platforms/${channel.identifier}.png`}
      alt={channel.identifier}
    />
  </div>
);

// Computers: the channel list on the left, like Buffer's.
const ChannelSidebar: FC<{ queued?: Record<string, number> }> = ({ queued }) => {
  const t = useT();
  const groups = useChannelGroups();
  const choice = useChannelChoice();
  const row = (active: boolean) =>
    clsx(
      'w-full flex items-center gap-[10px] px-[10px] min-h-[44px] rounded-[8px] text-start text-[14px]',
      active ? 'text-textItemFocused bg-boxFocused' : 'hover:bg-boxFocused'
    );
  return (
    <div className="mobile:hidden w-[260px] shrink-0 h-full bg-newBgColorInner p-[16px] flex flex-col gap-[16px] overflow-y-auto">
      <button onClick={() => choice.choose(null)} className={row(choice.all)}>
        <div className="w-[32px] h-[32px] rounded-full bg-newTableBorder flex items-center justify-center shrink-0">
          <AllSvg />
        </div>
        <span className="flex-1 font-[600]">{t('all_channels', 'All channels')}</span>
      </button>
      {groups.map((group) => (
        <div key={group.name} className="flex flex-col gap-[4px]">
          {group.name && (
            <div className="px-[10px] text-[12px] font-[600] uppercase tracking-wide text-textColor/60">{group.name}</div>
          )}
          {group.channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => choice.choose(channel.id)}
              className={row(choice.isChosen(channel.id))}
              title={channel.name}
            >
              <ChannelAvatar channel={channel} size={32} />
              <span className="flex-1 min-w-0 truncate">{channel.name}</span>
              {!!queued?.[channel.id] && (
                <span className="text-[12px] text-textColor/70 tabular-nums">{queued[channel.id]}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

// Phones: the same channels as a row of pictures to swipe through, above the posts.
const ChannelStrip: FC<{ queued?: Record<string, number> }> = ({ queued }) => {
  const t = useT();
  const groups = useChannelGroups();
  const choice = useChannelChoice();
  const channels = groups.flatMap((g) => g.channels);
  const row = useRef<HTMLDivElement>(null);
  // The chosen channel is scrolled into sight (e.g. opened from a link with ?channel=).
  useEffect(() => {
    if (!choice.only) return;
    row.current
      ?.querySelector(`[data-channel="${choice.only}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [choice.only]);
  if (channels.length < 2) return null;
  return (
    <div
      ref={row}
      className="hidden mobile:flex gap-[10px] overflow-x-auto -mx-[12px] px-[12px] pb-[4px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        onClick={() => choice.choose(null)}
        className={clsx(
          'shrink-0 h-[48px] px-[14px] rounded-full border text-[13px] font-[600]',
          choice.all ? 'border-[#612BD3] text-[#612BD3]' : 'border-newTableBorder'
        )}
      >
        {t('all', 'All')}
      </button>
      {channels.map((channel) => (
        <button
          key={channel.id}
          onClick={() => choice.choose(channel.id)}
          aria-label={channel.name}
          data-channel={channel.id}
          className={clsx(
            'relative shrink-0 w-[48px] h-[48px] rounded-full flex items-center justify-center border-2',
            choice.isChosen(channel.id) ? 'border-[#612BD3]' : 'border-transparent'
          )}
        >
          <ChannelAvatar channel={channel} size={40} />
          {!!queued?.[channel.id] && (
            <span className="absolute -top-[2px] -end-[4px] rounded-full bg-newTableBorder text-[10px] font-[600] px-[5px] leading-[16px]">
              {queued[channel.id]}
            </span>
          )}
        </button>
      ))}
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

// A channel's free queue slots for the next two weeks (UTC times), or nothing without a channel.
type Slot = { integration: string; date: string };
const usePostsListSlots = (integration: string | null) => {
  const fetch = useFetch();
  return useSWR<{ slots: Slot[] }>(
    integration ? `/posts/list/slots?integrations=${integration}&days=14` : null,
    async (path: string) => (await fetch(path)).json(),
    { revalidateOnFocus: false }
  );
};

type ListItem = { kind: 'post'; date: string; post: any } | { kind: 'slot'; date: string; slot: Slot };

const PostList = () => {
  const t = useT();
  const user = useUser();
  const calendar = useCalendar();
  const actions = usePostActions();
  const { listPosts, listState, loading } = calendar;

  // The queue of one channel also shows its free time slots, like Buffer, to fill with a new post or a draft. (Slots
  // belong to a channel, so with several channels in view there are none, just a hint.)
  // (Not while searching: the list then shows only the matching posts.)
  const slotChannel =
    listState === 'scheduled' && calendar.selectedChannels?.length === 1 && !calendar.listSearch.trim()
      ? calendar.selectedChannels[0]
      : null;
  const { data: slotData, mutate: reloadSlots } = usePostsListSlots(slotChannel);
  useEffect(() => {
    if (slotChannel) reloadSlots();
  }, [listPosts]);
  const slots = useMemo(
    () => (slotChannel && calendar.listPage === 0 ? slotData?.slots || [] : []),
    [slotChannel, calendar.listPage, slotData]
  );

  // Posts (and free slots) by their day in the user's timezone: soonest first for the queue and drafts, newest first
  // for sent and failed, as the server sends them.
  const groups = useMemo(() => {
    const items: ListItem[] = [
      ...listPosts.map((post) => ({ kind: 'post' as const, date: post.publishDate as unknown as string, post })),
      ...slots.map((slot) => ({ kind: 'slot' as const, date: slot.date, slot })),
    ];
    if (slots.length) items.sort((a, b) => dayjs.utc(a.date).valueOf() - dayjs.utc(b.date).valueOf());
    const byDay = new Map<string, ListItem[]>();
    for (const item of items) {
      const key = fromUtc(item.date).format('YYYY-MM-DD');
      byDay.set(key, [...(byDay.get(key) || []), item]);
    }
    return [...byDay.entries()];
  }, [listPosts, slots]);
  const slotHint =
    listState === 'scheduled' && !slotChannel && !calendar.listSearch.trim() ? (
      <div className="text-[13px] text-textColor/60 text-center max-w-[900px] w-full mx-auto">
        {t('pick_channel_for_slots', 'Pick one channel to see its free time slots.')}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-[40px]">
        <LoadingComponent />
      </div>
    );
  }

  if (!listPosts.length && !slots.length) {
    const empty: Record<string, string> = {
      scheduled: t('no_upcoming_posts', 'No upcoming posts scheduled'),
      draft: t('no_draft_posts', 'No draft posts'),
      published: t('no_published_posts', 'No published posts'),
      error: t('no_failed_posts', 'No failed posts'),
    };
    return (
      <div className="flex flex-1 items-center justify-center py-[60px] text-[16px] text-center">
        {calendar.listSearch.trim()
          ? t('no_posts_match_search', 'No posts here match your search')
          : empty[listState] || t('no_posts', 'No posts')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[24px] mobile:gap-[20px] max-w-[900px] w-full mx-auto">
      {slotHint}
      {groups.map(([key, items]) => (
        <div key={key} className="flex flex-col gap-[12px]">
          <h2 className="text-[18px] mobile:text-[16px] font-[600] sticky top-0 z-[1] bg-newBgColorInner py-[4px]">
            {dayLabel(key, t)}
          </h2>
          {items.map((item) => (
            <div
              key={item.kind === 'post' ? item.post.id : `slot-${item.slot.integration}-${item.date}`}
              className="flex gap-[16px] mobile:flex-col mobile:gap-[6px]"
            >
              <div
                className={clsx(
                  'w-[80px] shrink-0 text-[14px] font-[600] mobile:hidden',
                  item.kind === 'post' ? 'pt-[14px]' : 'pt-[12px] text-textColor/60'
                )}
              >
                {fromUtc(item.date).format(isUSCitizen() ? 'h:mm A' : 'HH:mm')}
              </div>
              {item.kind === 'post' ? (
                <PostCard post={item.post} actions={actions} isSuperAdmin={!!user?.isSuperAdmin} />
              ) : (
                <EmptySlot slot={item.slot} />
              )}
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

type Shortcut = 'now' | 'queue' | 'draft';
// Which shortcuts a card offers: a queued post can go out now or back to drafts, a draft can go out now or into the
// queue, a failed one any of the three (retry, re-queue, park), a sent one none.
const shortcutsFor = (state: string): Shortcut[] =>
  state === 'QUEUE' ? ['now', 'draft'] : state === 'DRAFT' ? ['now', 'queue'] : state === 'ERROR' ? ['now', 'queue', 'draft'] : [];

// The card shortcuts save the post the way the editor does (components/new-launch/manage.modal.tsx): the post as it is
// is loaded, checked with /posts/valid and saved with /posts as 'now' (publish now), 'schedule' in a queue slot (add to
// queue: the given free slot, else its channel's next free one) or 'draft' at its own time (save as draft).
const usePostShortcut = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { reloadCalendarView } = useCalendar();
  // The channel's next free queue slot (UTC), like Buffer's queue; Postiz's own pick if the channel has none in 60 days.
  const nextSlot = async (integrationId: string) => {
    const { slots } = await (await fetch(`/posts/list/slots?integrations=${integrationId}&days=60`)).json();
    return slots?.[0]?.date || (await (await fetch(`/posts/find-slot/${integrationId}`)).json()).date;
  };
  return async (post: any, shortcut: Shortcut, slot?: string) => {
    if (
      shortcut === 'now' &&
      !(await deleteDialog(
        t('publish_now_question', 'This posts it to the channel right away.'),
        t('yes_publish_now', 'Yes, publish now'),
        t('publish_now', 'Publish now'),
        t('cancel', 'Cancel')
      ))
    )
      return;
    const data = await (await fetch(`/posts/group/${post.group}`)).json();
    if (!data?.posts?.length) {
      toaster.show(t('post_not_found', 'Post not found'), 'warning');
      reloadCalendarView();
      return;
    }
    const type = shortcut === 'queue' ? 'schedule' : shortcut;
    const date =
      shortcut === 'now'
        ? dayjs.utc()
        : shortcut === 'queue'
        ? dayjs.utc(slot || (await nextSlot(data.integration)))
        : dayjs.utc(data.posts[0].publishDate);
    const posts = [
      {
        integration: { id: data.integration },
        group: data.group,
        settings: { ...(data.settings || {}) },
        value: data.posts.map((value: any) => ({
          id: value.id,
          content: value.content,
          delay: value.delay || 0,
          image: (value.image || []).map(({ id, path, alt, thumbnail, thumbnailTimestamp }: any) => ({
            id,
            path,
            alt,
            thumbnail,
            thumbnailTimestamp,
          })),
        })),
      },
    ];
    // A draft skips the checks, as in the editor; anything going out must pass them (else: fix it in Edit).
    if (type !== 'draft') {
      const valid = await fetch('/posts/valid', { method: 'POST', body: JSON.stringify({ type, posts }) });
      if (!valid.ok) {
        const { message } = await valid.json().catch(() => ({}));
        toaster.show(typeof message === 'string' ? message : t('post_save_failed', 'Could not save the post'), 'warning');
        return;
      }
      const problem = ((await valid.json()) as any[]).find(
        (item) => item.emptyContent || item.valid === false || item.errors !== true || item.tooLong
      );
      if (problem) {
        toaster.show(
          `${problem.name}: ${
            problem.emptyContent
              ? t('post_needs_content_or_image', 'Your post should have at least one character or one image.')
              : problem.tooLong
              ? t('post_is_too_long', 'post is too long, please fix it')
              : problem.settingsError || (problem.errors !== true && problem.errors) || t('please_fix_your_settings', 'Please fix your settings')
          } ${t('open_edit_to_fix', '(open Edit to fix it)')}`,
          'warning'
        );
        return;
      }
    }
    const response = await fetch('/posts', {
      method: 'POST',
      body: JSON.stringify({
        type,
        tags: (post.tags || []).map(({ tag }: any) => ({ value: tag.id, label: tag.name })),
        shortLink: false,
        date: date.format('YYYY-MM-DDTHH:mm:ss'),
        posts,
      }),
    });
    if (!response.ok) {
      const { message } = await response.json().catch(() => ({}));
      toaster.show(typeof message === 'string' ? message : t('post_save_failed', 'Could not save the post'), 'warning');
      return;
    }
    toaster.show(
      shortcut === 'now'
        ? t('sent_to_publish', 'Sent to publish now')
        : shortcut === 'queue'
        ? `${t('added_to_queue', 'Added to the queue')}: ${fromUtc(date.format('YYYY-MM-DDTHH:mm:ss')).format(isUSCitizen() ? 'ddd, MMM D h:mm A' : 'ddd D MMM, HH:mm')}`
        : t('saved_as_draft', 'Saved as a draft'),
      'success'
    );
    reloadCalendarView();
  };
};

// A free queue slot of a channel, like Buffer's: its time, and a new post or a draft to fill it.
const EmptySlot: FC<{ slot: Slot }> = ({ slot }) => {
  const t = useT();
  const modal = useModals();
  const { integrations, reloadCalendarView } = useCalendar();
  const runShortcut = usePostShortcut();
  const channel = integrations.find((i) => i.id === slot.integration);
  const time = fromUtc(slot.date).format(isUSCitizen() ? 'h:mm A' : 'HH:mm');

  // The editor with this channel chosen and the slot's time set, as "Create Post" opens it otherwise.
  const newPost = () =>
    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      classNames: { modal: 'w-[100%] max-w-[1400px] text-textColor' },
      children: (
        <AddEditModal
          allIntegrations={integrations.map((p) => ({ ...p }))}
          integrations={integrations}
          selectedChannels={[slot.integration]}
          reopenModal={newPost}
          mutate={reloadCalendarView}
          date={fromUtc(slot.date)}
        />
      ),
      size: '80%',
      title: '',
    });

  const fromDrafts = () =>
    modal.openModal({
      title: t('add_draft_to_slot', 'Add a draft at {{time}}', { time }),
      closeOnClickOutside: true,
      closeOnEscape: true,
      withCloseButton: true,
      classNames: { modal: 'w-[100%] max-w-[640px] text-textColor' },
      children: (
        <DraftPicker
          integration={slot.integration}
          onPick={async (draft) => {
            modal.closeAll();
            await runShortcut(draft, 'queue', slot.date);
          }}
        />
      ),
    });

  return (
    <div className="flex-1 min-w-0 rounded-[12px] border-2 border-dashed border-newTableBorder px-[16px] py-[12px] mobile:px-[12px] flex items-center gap-[10px] flex-wrap">
      <div className="flex items-center gap-[8px] text-[14px] text-textColor/70 flex-1 min-w-[160px]">
        {channel && <ChannelAvatar channel={channel} size={24} />}
        <span>
          <span className="hidden mobile:inline font-[600] text-textColor">{time} · </span>
          {t('free_slot', 'Free slot')}
        </span>
      </div>
      <button
        onClick={newPost}
        className="min-h-[40px] px-[12px] rounded-[8px] border border-newTableBorder flex items-center gap-[6px] text-[14px] font-[500] hover:text-textItemFocused hover:bg-boxFocused"
      >
        + {t('new_post', 'New post')}
      </button>
      <button
        onClick={fromDrafts}
        className="min-h-[40px] px-[12px] rounded-[8px] border border-newTableBorder flex items-center gap-[6px] text-[14px] font-[500] hover:text-textItemFocused hover:bg-boxFocused"
      >
        <DraftSvg />
        {t('add_from_drafts', 'Add from drafts')}
      </button>
    </div>
  );
};

// The channel's drafts to fill a free slot with; picking one schedules it at that slot.
const DraftPicker: FC<{ integration: string; onPick: (draft: any) => Promise<void> }> = ({ integration, onPick }) => {
  const t = useT();
  const fetch = useFetch();
  const [drafts, setDrafts] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/posts/list?state=draft&limit=100&integrations=${integration}`)
      .then((r) => r.json())
      .then((data) => setDrafts(expandPostsList(data).posts || []))
      .catch(() => setDrafts([]));
  }, [integration]);
  if (!drafts) return <div className="py-[24px] flex justify-center"><LoadingComponent /></div>;
  if (!drafts.length)
    return <div className="py-[24px] text-center text-[14px]">{t('no_drafts_for_channel', 'This channel has no drafts.')}</div>;
  return (
    <div className="flex flex-col gap-[8px] max-h-[60vh] overflow-y-auto">
      {drafts.map((draft) => {
        const text = stripHtmlValidation('none', (draft.content || '').replace(/<\/p>\s*<p[^>]*>/gi, ' '), false, true, false);
        const first = (() => {
          try {
            return JSON.parse(draft.image || '[]')[0] as Media | undefined;
          } catch {
            return undefined;
          }
        })();
        return (
          <div key={draft.id} className="flex items-center gap-[12px] rounded-[10px] border border-newTableBorder p-[10px]">
            {first && (
              <div className="w-[56px] h-[56px] shrink-0 rounded-[8px] overflow-hidden bg-newTableBorder">
                {isVideo(first.path) && !first.thumbnail ? (
                  <LazyVideoFrame src={first.path} />
                ) : (
                  <img src={first.thumbnail || first.path} alt="" loading="lazy" className="w-full h-full object-cover" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0 text-[13px] line-clamp-2 break-words">{text || t('no_content', 'no content')}</div>
            <button
              disabled={!!busy}
              onClick={async () => {
                setBusy(draft.id);
                try {
                  await onPick(draft);
                } finally {
                  setBusy(null);
                }
              }}
              className="shrink-0 min-h-[40px] px-[12px] rounded-[8px] bg-[#612BD3] text-white text-[14px] font-[500] disabled:opacity-50"
            >
              {busy === draft.id ? t('saving', 'Saving…') : t('add_here', 'Add here')}
            </button>
          </div>
        );
      })}
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
  const runShortcut = usePostShortcut();
  const [busy, setBusy] = useState<Shortcut | null>(null);
  const shortcut = (which: Shortcut) => async () => {
    setBusy(which);
    try {
      await runShortcut(post, which);
    } finally {
      setBusy(null);
    }
  };
  const shortcutLabels: Record<Shortcut, string> = {
    now: t('publish_now', 'Publish now'),
    queue: t('add_to_queue', 'Add to queue'),
    draft: t('save_as_draft', 'Save as draft'),
  };
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
                loading="lazy"
                className="w-[36px] h-[36px] rounded-full object-cover"
                src={post.integration?.picture || '/no-picture.jpg'}
                alt=""
              />
              <img
                loading="lazy"
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
      <div className="flex items-center flex-wrap gap-[8px] border-t border-newTableBorder px-[16px] mobile:px-[12px] py-[8px]">
        {/* the shortcuts on the left (Publish now highlighted), Edit and the menu on the right; they wrap on a phone */}
        {shortcutsFor(post.state).map((which) => (
          <button
            key={which}
            disabled={!!busy}
            onClick={shortcut(which)}
            className={clsx(
              'min-h-[40px] px-[12px] rounded-[8px] flex items-center gap-[6px] text-[14px] font-[500] disabled:opacity-50',
              which === 'now'
                ? 'bg-[#612BD3] text-white hover:opacity-90'
                : 'border border-newTableBorder hover:text-textItemFocused hover:bg-boxFocused'
            )}
          >
            {which === 'now' ? <SendSvg /> : which === 'queue' ? <QueueSvg /> : <DraftSvg />}
            {busy === which ? t('saving', 'Saving…') : shortcutLabels[which]}
          </button>
        ))}
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const first = media[0];
  const src = first.thumbnail || first.path;
  return (
    <>
    <button
      onClick={() => setOpen(true)}
      aria-label={t('preview', 'Preview')}
      className="relative shrink-0 w-[140px] h-[140px] mobile:w-full mobile:h-auto mobile:max-h-[320px] mobile:aspect-[4/5] rounded-[10px] overflow-hidden bg-newTableBorder cursor-zoom-in"
    >
      {!first.thumbnail && isVideo(first.path) ? (
        <LazyVideoFrame src={first.path} />
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
    </button>
    {open && <MediaPreview media={media} onClose={() => setOpen(false)} />}
    </>
  );
};

// A video's first frame as its thumbnail, fetched only when the card comes near the screen (images use the browser's
// own loading="lazy"), so a long list doesn't download the start of every video at once.
const LazyVideoFrame: FC<{ src: string }> = ({ src }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return (
    <div ref={ref} className="w-full h-full">
      {near && (
        <video src={`${src}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
      )}
    </div>
  );
};

// The post's images and videos over the page (not in a new tab): the whole image, the video playing with sound and
// controls, arrows (and the arrow keys) between several media; closes with the X, a click beside it, or Escape.
const MediaPreview: FC<{ media: Media[]; onClose: () => void }> = ({ media, onClose }) => {
  const t = useT();
  const [index, setIndex] = useState(0);
  const item = media[index];
  const step = (by: number) => setIndex((i) => (i + by + media.length) % media.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && media.length > 1) step(1);
      if (e.key === 'ArrowLeft' && media.length > 1) step(-1);
    };
    window.addEventListener('keydown', onKey);
    // the page behind doesn't scroll while the preview is open
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [media.length]);
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-[24px] mobile:p-[8px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        aria-label={t('close', 'Close')}
        className="absolute top-[16px] start-[16px] w-[44px] h-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white text-[20px] flex items-center justify-center z-[1]"
      >
        ✕
      </button>
      <div className="max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isVideo(item.path) ? (
          <video
            key={item.path}
            src={item.path}
            controls
            autoPlay
            playsInline
            className="max-w-[min(90vw,720px)] max-h-[85vh] mobile:max-w-full rounded-[10px] bg-black"
          />
        ) : (
          <img
            key={item.path}
            src={item.path}
            alt=""
            className="max-w-[90vw] max-h-[85vh] mobile:max-w-full object-contain rounded-[10px]"
          />
        )}
      </div>
      {media.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            aria-label={t('previous', 'Previous')}
            className="absolute start-[16px] mobile:start-[8px] top-1/2 -translate-y-1/2 w-[44px] h-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white text-[22px] flex items-center justify-center"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            aria-label={t('next', 'Next')}
            className="absolute end-[16px] mobile:end-[8px] top-1/2 -translate-y-1/2 w-[44px] h-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white text-[22px] flex items-center justify-center"
          >
            ›
          </button>
          <div className="absolute bottom-[16px] start-1/2 -translate-x-1/2 text-white text-[13px] bg-black/50 rounded-full px-[10px] py-[2px]">
            {index + 1} / {media.length}
          </div>
        </>
      )}
    </div>
  );
};

const AllSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

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

const SendSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const QueueSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path d="M4 6h16M4 12h10M4 18h7M17 15v6M14 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const DraftSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path
      d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z M14 3v6h6 M8 13h8 M8 17h5"
      stroke="currentColor"
      strokeWidth="1.8"
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
