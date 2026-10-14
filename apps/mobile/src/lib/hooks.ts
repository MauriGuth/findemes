import {
  type CreateCommitmentInput as NewCommitment,
  type RecurringSuggestionDto,
  type Budget,
  type Stats,
  type UpsertBudgetInput,
  type ChatChannel,
  type ChatLink,
  type EntryDraft,
  type Features,
  type Receipt,
  type Bill,
  type Category,
  type CreateBillInput,
  type InboundAddress,
  type PayBillInput,
  type UpdateBillInput,
  type Commitment,
  type CreateCommitmentInput,
  type CreateInstallmentPurchaseInput,
  type CreateTransactionInput,
  type MonthKey,
  type MonthPlan,
  type MonthSummary,
  type PayCommitmentInput,
  type Source,
  type Transaction,
  type UpdateCommitmentInput,
  type UpdateTransactionInput,
  type UpdateUserInput,
  type UpsertMonthPlanInput,
  type User,
} from '@findemes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api';
import { periodKeyOf, todayInArt } from '@findemes/shared';
import { useMemo } from 'react';
import { useSession } from './session';

export const keys = {
  summary: (month: MonthKey) => ['summary', month] as const,
  transactions: (month: MonthKey) => ['transactions', month] as const,
  transaction: (id: string) => ['transaction', id] as const,
  plan: (month: MonthKey) => ['plan', month] as const,
  commitments: (includeInactive: boolean) => ['commitments', includeInactive] as const,
  me: ['me'] as const,
  catalog: ['catalog'] as const,
  bills: (month: MonthKey) => ['bills', month] as const,
  billCandidates: (id: string) => ['bill-candidates', id] as const,
  inbound: ['inbound'] as const,
  features: ['features'] as const,
  receipts: ['receipts'] as const,
  receipt: (id: string) => ['receipt', id] as const,
  chats: ['chats'] as const,
  budgets: (month: MonthKey) => ['budgets', month] as const,
  stats: (month: MonthKey) => ['stats', month] as const,
  suggestions: ['suggestions'] as const,
};

/** The user's current month (payday to payday); re-renders when the payday changes. */
export function useCurrentMonthKey(): MonthKey {
  const payday = useSession((s) => s.payday);
  return useMemo(() => periodKeyOf(todayInArt(), payday), [payday]);
}

/** Everything money-related depends on everything else: invalidate broadly, it is cheap. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['summary'] }),
      qc.invalidateQueries({ queryKey: ['transactions'] }),
      qc.invalidateQueries({ queryKey: ['transaction'] }),
      qc.invalidateQueries({ queryKey: ['plan'] }),
      qc.invalidateQueries({ queryKey: ['commitments'] }),
      qc.invalidateQueries({ queryKey: ['bills'] }),
      qc.invalidateQueries({ queryKey: ['bill-candidates'] }),
      qc.invalidateQueries({ queryKey: ['budgets'] }),
      qc.invalidateQueries({ queryKey: ['stats'] }),
    ]);
}

export function useSummary(requested?: MonthKey) {
  const current = useCurrentMonthKey();
  const month = requested ?? current;
  return useQuery({
    queryKey: keys.summary(month),
    queryFn: () => apiGet<MonthSummary>(`/insights/summary?month=${month}`),
  });
}

export function useTransactions(requested?: MonthKey) {
  const current = useCurrentMonthKey();
  const month = requested ?? current;
  return useQuery({
    queryKey: keys.transactions(month),
    queryFn: async () =>
      (await apiGet<{ items: Transaction[] }>(`/transactions?month=${month}`)).items,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: keys.transaction(id),
    queryFn: () => apiGet<Transaction>(`/transactions/${id}`),
    enabled: id.length > 0,
  });
}

export function usePlan(requested?: MonthKey) {
  const current = useCurrentMonthKey();
  const month = requested ?? current;
  return useQuery({
    queryKey: keys.plan(month),
    queryFn: async () => {
      try {
        return await apiGet<MonthPlan>(`/plans/${month}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export function useCommitments(includeInactive = false) {
  return useQuery({
    queryKey: keys.commitments(includeInactive),
    queryFn: async () =>
      (
        await apiGet<{ items: Commitment[] }>(
          `/commitments${includeInactive ? '?includeInactive=true' : ''}`,
        )
      ).items,
  });
}

/** One commitment (active or not), from the full list so the edit screen shares the cache. */
export function useCommitment(id: string) {
  const all = useCommitments(true);
  return { ...all, data: all.data?.find((c) => c.id === id) ?? null };
}

export function useCatalog() {
  return useQuery({
    queryKey: keys.catalog,
    staleTime: 24 * 3_600_000,
    queryFn: async () => {
      const [sources, categories] = await Promise.all([
        apiGet<Source[]>('/catalog/sources'),
        apiGet<Category[]>('/catalog/categories'),
      ]);
      return { sources, categories };
    },
  });
}

/** "Por pagar": bills due in the month plus unpaid ones overdue (ADR 013). */
export function useBills(requested?: MonthKey) {
  const current = useCurrentMonthKey();
  const month = requested ?? current;
  return useQuery({
    queryKey: keys.bills(month),
    queryFn: async () => (await apiGet<{ items: Bill[] }>(`/bills?month=${month}`)).items,
  });
}

export function useBillCandidates(id: string) {
  return useQuery({
    queryKey: keys.billCandidates(id),
    queryFn: () => apiGet<Transaction[]>(`/bills/${id}/candidates`),
    enabled: id.length > 0,
  });
}

/** The forwarding address; refetched every 15 s until Gmail's code for it arrives. */
export function useInboundAddress() {
  return useQuery({
    queryKey: keys.inbound,
    queryFn: () => apiGet<InboundAddress>('/me/inbound'),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.address && !data.gmailConfirmation ? 15_000 : false;
    },
  });
}

export function useRotateInbound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<InboundAddress>('/me/inbound/rotate'),
    onSuccess: (data) => qc.setQueryData(keys.inbound, data),
  });
}

/** Budgets with what was spent this period (Phase 5). */
export function useBudgets(requested?: MonthKey) {
  const current = useCurrentMonthKey();
  const month = requested ?? current;
  return useQuery({
    queryKey: keys.budgets(month),
    queryFn: async () => (await apiGet<{ items: Budget[] }>(`/budgets?month=${month}`)).items,
  });
}

export const useUpsertBudget = () =>
  useMoneyMutation((input: UpsertBudgetInput) => apiPut<Budget>('/budgets', input));
export const useDeleteBudget = () =>
  useMoneyMutation((id: string) => apiDelete<void>(`/budgets/${id}`));

export function useStats(requested?: MonthKey) {
  const current = useCurrentMonthKey();
  const month = requested ?? current;
  return useQuery({
    queryKey: keys.stats(month),
    queryFn: () => apiGet<Stats>(`/insights/stats?month=${month}`),
  });
}

/** Payments that look monthly and are not commitments yet (Phase 7). */
export function useRecurringSuggestions() {
  return useQuery({
    queryKey: keys.suggestions,
    staleTime: 60 * 60_000,
    queryFn: async () =>
      (await apiGet<{ items: RecurringSuggestionDto[] }>('/suggestions/commitments')).items,
  });
}

export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => apiPost<void>('/suggestions/commitments/dismiss', { key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.suggestions }),
  });
}

/** Adds the suggested payment as a commitment, then drops the suggestion. */
export function useAcceptSuggestion() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (s: RecurringSuggestionDto) =>
      apiPost<Commitment>('/commitments', {
        name: s.name.slice(0, 80),
        kind: 'SUBSCRIPTION',
        amount: s.amount,
        method: s.method,
        dayOfMonth: s.dayOfMonth,
      } satisfies NewCommitment),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: keys.suggestions });
    },
  });
}

/** Optional integrations the server has configured (ADR 014). */
export function useFeatures() {
  return useQuery({
    queryKey: keys.features,
    staleTime: 10 * 60_000,
    queryFn: () => apiGet<Features>('/features'),
  });
}

/** A ticket; polled every 2 s while Claude reads it. */
export function useReceipt(id: string) {
  const invalidate = useInvalidateMoney();
  return useQuery({
    queryKey: keys.receipt(id),
    enabled: id.length > 0,
    queryFn: async () => {
      const receipt = await apiGet<Receipt>(`/receipts/${id}`);
      if (receipt.status !== 'UPLOADED') void invalidate();
      return receipt;
    },
    refetchInterval: (query) => (query.state.data?.status === 'UPLOADED' ? 2_000 : false),
  });
}

export function useRetryReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<Receipt>(`/receipts/${id}/retry`),
    onSuccess: (receipt) => qc.setQueryData(keys.receipt(receipt.id), receipt),
  });
}

export const useDeleteReceipt = () =>
  useMoneyMutation((id: string) => apiDelete<void>(`/receipts/${id}`));

export function useParseEntry() {
  return useMutation({
    mutationFn: async (text: string) =>
      (await apiPost<{ drafts: EntryDraft[] }>('/entries/parse', { text })).drafts,
  });
}

export const useSaveEntries = () =>
  useMoneyMutation(
    async (drafts: EntryDraft[]) =>
      (await apiPost<{ items: Transaction[] }>('/entries', { drafts })).items,
  );

/** Linked chats; refetched every 5 s while a link is pending so the screen updates by itself. */
export function useChats() {
  return useQuery({
    queryKey: keys.chats,
    queryFn: () => apiGet<ChatLink>('/me/chats'),
    refetchInterval: (query) => {
      const data = query.state.data;
      const waiting =
        (data?.telegram.available && !data.telegram.linked) ||
        (data?.whatsapp.available && !data.whatsapp.linked);
      return waiting ? 5_000 : false;
    },
  });
}

export function useUnlinkChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channel: ChatChannel) => apiDelete<void>(`/me/chats/${channel}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.chats }),
  });
}

export function useMe() {
  const setUser = useSession((s) => s.setUser);
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      const user = await apiGet<User>('/me');
      setUser(user);
      return user;
    },
  });
}

function useMoneyMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: run, onSuccess: () => invalidate() });
}

export const useCreateTransaction = () =>
  useMoneyMutation((input: CreateTransactionInput) => apiPost<Transaction>('/transactions', input));
export const useUpdateTransaction = () =>
  useMoneyMutation(({ id, ...input }: UpdateTransactionInput & { id: string }) =>
    apiPatch<Transaction>(`/transactions/${id}`, input),
  );
export const useDeleteTransaction = () =>
  useMoneyMutation((id: string) => apiDelete<void>(`/transactions/${id}`));
export const useCreateInstallmentPurchase = () =>
  useMoneyMutation((input: CreateInstallmentPurchaseInput) =>
    apiPost<Commitment>('/transactions/installments', input),
  );
export const usePayCommitment = () =>
  useMoneyMutation(({ id, ...input }: PayCommitmentInput & { id: string }) =>
    apiPost<Transaction>(`/commitments/${id}/payments`, input),
  );
export const useUpsertPlan = () =>
  useMoneyMutation(({ month, ...input }: UpsertMonthPlanInput & { month: MonthKey }) =>
    apiPut<MonthPlan>(`/plans/${month}`, input),
  );
export const useCreateCommitment = () =>
  useMoneyMutation((input: CreateCommitmentInput) => apiPost<Commitment>('/commitments', input));
export const useUpdateCommitment = () =>
  useMoneyMutation(({ id, ...input }: UpdateCommitmentInput & { id: string }) =>
    apiPatch<Commitment>(`/commitments/${id}`, input),
  );
export const useCreateBill = () =>
  useMoneyMutation((input: CreateBillInput) => apiPost<Bill>('/bills', input));
export const useUpdateBill = () =>
  useMoneyMutation(({ id, ...input }: UpdateBillInput & { id: string }) =>
    apiPatch<Bill>(`/bills/${id}`, input),
  );
export const usePayBill = () =>
  useMoneyMutation(({ id, ...input }: PayBillInput & { id: string }) =>
    apiPost<Bill>(`/bills/${id}/payments`, input),
  );
export const useDeleteCommitment = () =>
  useMoneyMutation((id: string) => apiDelete<void>(`/commitments/${id}`));

export function useUpdateMe() {
  const qc = useQueryClient();
  const setUser = useSession((s) => s.setUser);
  return useMutation({
    mutationFn: (input: UpdateUserInput) => apiPatch<User>('/me', input),
    onSuccess: (user) => {
      setUser(user);
      qc.setQueryData(keys.me, user);
    },
  });
}

export function useDeleteMe() {
  return useMutation({ mutationFn: () => apiDelete<void>('/me') });
}

export function errorMessage(
  error: unknown,
  fallback = 'Algo salió mal. Probá de nuevo en un rato.',
): string {
  return error instanceof ApiError ? error.message : fallback;
}
