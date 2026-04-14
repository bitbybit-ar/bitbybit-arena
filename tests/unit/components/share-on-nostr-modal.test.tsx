import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ShareContext } from "@/components/share/ShareOnNostrModal";
import { ShareOnNostrModal } from "@/components/share/ShareOnNostrModal";

// Mock next-intl. The component calls t(key, params) with placeholders like
// {title}, {link}, {badge} — return a deterministic string that includes
// the substituted values so assertions can pin exact content.
vi.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: (namespace?: string) => {
    const dict: Record<string, string> = {
      title: "Compartir en Nostr",
      placeholder: "Editá tu mensaje…",
      publish: "Publicar",
      cancel: "Cancelar",
      publishing: "Publicando…",
      published: "¡Publicado!",
      error: "No pudimos publicar.",
      "suggested.challengeCreated":
        "Acabo de lanzar {title} 🏆 {link}",
      "suggested.challengeJoined": "Me sumé a {title} 👉 {link}",
      "suggested.challengeCompleted": "¡Completé {title}! {link}",
      "suggested.badgeReceived":
        "Gané {badge} completando {title} {link}",
    };
    return (key: string, values?: Record<string, string>) => {
      const raw = dict[key] ?? `${namespace ?? ""}:${key}`;
      if (!values) return raw;
      return Object.entries(values).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`{${k}}`, "g"), v),
        raw,
      );
    };
  },
}));

// Mock the signer context so we can assert mockSign was called and
// swap it for a failing implementation to cover the error branch.
// vi.mock is hoisted, so only vars prefixed `mock` are visible inside the
// factory — use mockSign/mockPublish and re-export for assertions.
const mockSign = vi.fn();
const mockPublish = vi.fn();

vi.mock("@/lib/signer-context", () => ({
  useSignerContext: () => ({ signWithPrompt: mockSign }),
}));

vi.mock("@/lib/nostr/publish", () => ({
  publishSignedEvent: (...args: unknown[]) => mockPublish(...args),
}));

// The Button component imports Link from @/i18n/routing, which pulls in
// next-intl/navigation → next/navigation and breaks under vitest's ESM
// resolution. The modal never renders an anchor button so a stub is enough.
vi.mock("@/i18n/routing", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  routing: { locales: ["es", "en"], defaultLocale: "es" },
}));

// Silence the base Modal's ClickOutside side effects in jsdom — nothing to
// do, we just render the component as-is.

beforeEach(() => {
  mockSign.mockReset();
  mockPublish.mockReset();
  mockSign.mockResolvedValue({ id: "signed-event-id" });
  mockPublish.mockResolvedValue(undefined);
  process.env.NEXT_PUBLIC_APP_URL = "https://arena.bitbybit.com.ar";
});

const CHALLENGE = { id: "abc-123", title: "30 días de lectura" };

function renderWith(context: ShareContext) {
  const onClose = vi.fn();
  const onPublished = vi.fn();
  render(
    <ShareOnNostrModal
      context={context}
      onClose={onClose}
      onPublished={onPublished}
    />,
  );
  return { onClose, onPublished };
}

describe("ShareOnNostrModal", () => {
  it.each<ShareContext>([
    { kind: "challenge-created", challenge: CHALLENGE },
    { kind: "challenge-joined", challenge: CHALLENGE },
    { kind: "challenge-completed", challenge: CHALLENGE },
    {
      kind: "badge-received",
      challenge: CHALLENGE,
      badgeName: "Maestro Zen",
    },
  ])("pre-fills textarea with title and challenge link for %s", (context) => {
    renderWith(context);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toContain(CHALLENGE.title);
    // Link must end with /explore/{id} regardless of locale/base URL.
    expect(textarea.value).toMatch(/\/explore\/abc-123(?:\s|$)/);
  });

  it("includes the badge name in the badge-received variant", () => {
    renderWith({
      kind: "badge-received",
      challenge: CHALLENGE,
      badgeName: "Maestro Zen",
    });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Maestro Zen");
  });

  it("publishes via mockSign + mockPublish and closes", async () => {
    const { onClose, onPublished } = renderWith({
      kind: "challenge-created",
      challenge: CHALLENGE,
    });

    fireEvent.click(screen.getByRole("button", { name: /publicar/i }));

    await waitFor(() => {
      expect(mockSign).toHaveBeenCalledTimes(1);
    });
    const unsigned = mockSign.mock.calls[0][0];
    expect(unsigned.kind).toBe(1);
    expect(unsigned.content).toContain(CHALLENGE.title);

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledTimes(1);
    });
    expect(mockPublish.mock.calls[0][0]).toEqual({
      id: "signed-event-id",
    });

    await waitFor(() => {
      expect(onPublished).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an inline error when signing fails and stays open", async () => {
    mockSign.mockRejectedValueOnce(new Error("re_sign_in_cancelled"));
    const { onClose } = renderWith({
      kind: "challenge-joined",
      challenge: CHALLENGE,
    });

    fireEvent.click(screen.getByRole("button", { name: /publicar/i }));

    await waitFor(() => {
      expect(screen.getByText(/no pudimos publicar/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
