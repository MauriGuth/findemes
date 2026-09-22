import {
  type Category,
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
import { currentMonthKey } from './format';
import { useSession } from './session';

export const keys = {
  summary: (month: MonthKey) => ['summary', month] as const,
  transactions: (month: MonthKey) => ['transactions', month] as const,
  transaction: (id: string) => ['transaction', id] as const,
  plan: (month: MonthKey) => ['plan', month] as const,
  commitments: (includeInactive: boolean) => ['commitments', includeInactive] as const,
  me: ['me'] as const,
  catalog: ['catalog'] as const,
};

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
    ]);
}

export function useSummary(month: MonthKey = currentMonthKey()) {
  return useQuery({
    queryKey: keys.summary(month),
    queryFn: () => apiGet<MonthSummary>(`/insights/summary?month=${month}`),
  });
}

export function useTransactions(month: MonthKey = currentMonthKey()) {
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
  });
}

export function usePlan(month: MonthKey = currentMonthKey()) {
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
