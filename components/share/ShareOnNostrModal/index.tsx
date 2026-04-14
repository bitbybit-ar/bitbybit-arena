"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { buildNoteEvent } from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import { useSignerContext } from "@/lib/signer-context";
import styles from "./share-on-nostr-modal.module.scss";

export type ShareContext =
  | { kind: "challenge-created"; challenge: { id: string; title: string } }
  | { kind: "challenge-joined"; challenge: { id: string; title: string } }
  | { kind: "challenge-completed"; challenge: { id: string; title: string } }
  | {
      kind: "badge-received";
      challenge: { id: string; title: string };
      badgeName: string;
    };

interface ShareOnNostrModalProps {
  context: ShareContext;
  onClose: () => void;
  onPublished?: () => void;
}

type PublishState = "idle" | "publishing" | "published" | "error";

const APP_URL_FALLBACK = "https://arena.bitbybit.com.ar";

function suggestedKeyFor(kind: ShareContext["kind"]): string {
  switch (kind) {
    case "challenge-created":
      return "suggested.challengeCreated";
    case "challenge-joined":
      return "suggested.challengeJoined";
    case "challenge-completed":
      return "suggested.challengeCompleted";
    case "badge-received":
      return "suggested.badgeReceived";
  }
}

export function ShareOnNostrModal({
  context,
  onClose,
  onPublished,
}: ShareOnNostrModalProps) {
  const t = useTranslations("shareOnNostr");
  const locale = useLocale();
  const { signWithPrompt } = useSignerContext();

  const link = useMemo(() => {
    // Strip a trailing slash so a NEXT_PUBLIC_APP_URL of
    // "https://arena.bitbybit.com.ar/" doesn't produce a "//es/explore/…".
    const base = (process.env.NEXT_PUBLIC_APP_URL || APP_URL_FALLBACK).replace(
      /\/+$/,
      "",
    );
    return `${base}/${locale}/explore/${context.challenge.id}`;
  }, [locale, context.challenge.id]);

  const initialContent = useMemo(() => {
    const key = suggestedKeyFor(context.kind);
    if (context.kind === "badge-received") {
      return t(key, {
        title: context.challenge.title,
        link,
        badge: context.badgeName,
      });
    }
    return t(key, { title: context.challenge.title, link });
  }, [context, link, t]);

  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<PublishState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePublish = async () => {
    setState("publishing");
    setErrorMessage(null);
    try {
      const signed = await signWithPrompt(buildNoteEvent(content));
      // Publish is fire-and-forget at the relay layer; once we've signed
      // successfully the UX treats the share as published.
      publishSignedEvent(signed).catch(() => {});
      setState("published");
      onPublished?.();
      onClose();
    } catch {
      setState("error");
      setErrorMessage(t("error"));
    }
  };

  const isBusy = state === "publishing";

  return (
    <Modal onClose={onClose} title={t("title")} size="md">
      <textarea
        className={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("placeholder")}
        rows={6}
        disabled={isBusy}
        aria-label={t("title")}
      />
      <div className={styles.counter} aria-live="polite">
        {content.length}
      </div>
      {errorMessage && <p className={styles.error}>{errorMessage}</p>}
      <div className={styles.actions}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isBusy}
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handlePublish}
          disabled={isBusy || content.trim().length === 0}
        >
          {state === "publishing"
            ? t("publishing")
            : state === "published"
              ? t("published")
              : t("publish")}
        </Button>
      </div>
    </Modal>
  );
}

export default ShareOnNostrModal;
