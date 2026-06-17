"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "./api";

export interface Crud<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  creating: boolean;
  createError: string | null;
  create: (body: unknown) => Promise<boolean>;
  editId: string | null;
  startEdit: (id: string) => void;
  cancelEdit: () => void;
  saving: boolean;
  editError: string | null;
  save: (id: string, body: unknown) => Promise<boolean>;
  deletingId: string | null;
  deleteError: string | null;
  remove: (id: string) => Promise<void>;
}

/**
 * CRUD state machine for a list resource at `endpoint` (GET list, POST create,
 * PATCH `${endpoint}/${id}`, DELETE `${endpoint}/${id}`). Mirrors the per-page
 * admin logic it replaces: optimistic row removal on delete, reload after
 * create/save, Korean error fallbacks. JSX stays in the page.
 */
export function useCrud<T extends { id: string }>(endpoint: string): Crud<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<T[]>(endpoint)
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [endpoint]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<T[]>(endpoint)
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const create = useCallback(
    async (body: unknown): Promise<boolean> => {
      setCreating(true);
      setCreateError(null);
      try {
        await api.post<T>(endpoint, body);
        reload();
        return true;
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : "생성에 실패했습니다");
        return false;
      } finally {
        setCreating(false);
      }
    },
    [endpoint, reload],
  );

  const save = useCallback(
    async (id: string, body: unknown): Promise<boolean> => {
      setSaving(true);
      setEditError(null);
      try {
        await api.patch<T>(`${endpoint}/${id}`, body);
        setEditId(null);
        reload();
        return true;
      } catch (e) {
        setEditError(e instanceof Error ? e.message : "저장에 실패했습니다");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [endpoint, reload],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setDeletingId(id);
      setDeleteError(null);
      try {
        await api.delete<T>(`${endpoint}/${id}`);
        setItems((cur) => cur.filter((it) => it.id !== id));
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "삭제에 실패했습니다");
      } finally {
        setDeletingId(null);
      }
    },
    [endpoint],
  );

  const startEdit = useCallback((id: string) => {
    setEditId(id);
    setEditError(null);
  }, []);
  const cancelEdit = useCallback(() => setEditId(null), []);

  return {
    items,
    loading,
    error,
    reload,
    creating,
    createError,
    create,
    editId,
    startEdit,
    cancelEdit,
    saving,
    editError,
    save,
    deletingId,
    deleteError,
    remove,
  };
}
