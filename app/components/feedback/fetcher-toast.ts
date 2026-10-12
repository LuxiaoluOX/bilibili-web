import { App } from "antd";
import { useEffect, useRef } from "react";

export type ActionFeedback = { ok: boolean; message: string; intent?: string };

export type FetcherToastOptions = {
  loading?: string;
  success?: string;
  error?: string;
  loadingDelay?: number;
  successDuration?: number;
  errorDuration?: number;
};

type FetcherLike = {
  state: "idle" | "submitting" | "loading";
  data?: unknown;
};

export function useFetcherToast(fetcher: FetcherLike, options: FetcherToastOptions = {}) {
  const { message, notification } = App.useApp();
  const wasBusy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = useRef(`fetcher-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (fetcher.state !== "idle") {
      if (!wasBusy.current) {
        wasBusy.current = true;
        timer.current = setTimeout(() => {
          message.open({ key: key.current, type: "loading", content: options.loading ?? "正在处理…", duration: 0 });
        }, options.loadingDelay ?? 300);
      }
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const result = fetcher.data as Partial<ActionFeedback> | undefined;
    if (result?.ok === false) {
      message.destroy(key.current);
      notification.error({
        message: options.error ?? "操作未完成",
        description: result.message ?? "请检查输入后重试。",
        duration: options.errorDuration ?? 5,
      });
      return;
    }
    message.open({
      key: key.current,
      type: "success",
      content: result?.message ?? options.success ?? "操作已完成",
      duration: options.successDuration ?? 2.5,
    });
  }, [fetcher.state, fetcher.data, message, notification, options.error, options.errorDuration, options.loading, options.loadingDelay, options.success, options.successDuration]);
}
