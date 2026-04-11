import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionCard, OptionCardGroup } from "@/components/common/OptionCard";

describe("OptionCard", () => {
  it("renders as a toggle button with aria-pressed reflecting selection", () => {
    const { rerender } = render(
      <OptionCard title="Fitness" selected={false} onToggle={() => {}} />
    );
    const btn = screen.getByRole("button", { name: /fitness/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    rerender(<OptionCard title="Fitness" selected onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /fitness/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("calls onToggle on click", () => {
    const onToggle = vi.fn();
    render(
      <OptionCard title="Race" selected={false} onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole("button", { name: /race/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not call onToggle when disabled", () => {
    const onToggle = vi.fn();
    render(
      <OptionCard title="Race" selected={false} disabled onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole("button", { name: /race/i }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("renders the description when provided", () => {
    render(
      <OptionCard
        title="Streak"
        description="Do it every day"
        selected={false}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("Do it every day")).toBeInTheDocument();
  });
});

describe("OptionCardGroup", () => {
  it("renders a labeled group", () => {
    render(
      <OptionCardGroup label="Challenge type">
        <OptionCard title="A" selected onToggle={() => {}} />
        <OptionCard title="B" selected={false} onToggle={() => {}} />
      </OptionCardGroup>
    );
    const group = screen.getByRole("group", { name: /challenge type/i });
    expect(group).toBeInTheDocument();
    expect(group.querySelectorAll("button")).toHaveLength(2);
  });

  it("supports multi-select behavior via parent state", () => {
    const Wrapper = () => {
      const options = ["a", "b", "c"];
      const [value, setValue] = useState<string[]>([]);
      return (
        <OptionCardGroup label="Methods">
          {options.map((o) => (
            <OptionCard
              key={o}
              multi
              title={o}
              selected={value.includes(o)}
              onToggle={() =>
                setValue(
                  value.includes(o) ? value.filter((x) => x !== o) : [...value, o]
                )
              }
            />
          ))}
        </OptionCardGroup>
      );
    };
    render(<Wrapper />);
    const a = screen.getByRole("button", { name: "a" });
    const b = screen.getByRole("button", { name: "b" });
    fireEvent.click(a);
    fireEvent.click(b);
    expect(a).toHaveAttribute("aria-pressed", "true");
    expect(b).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(a);
    expect(a).toHaveAttribute("aria-pressed", "false");
    expect(b).toHaveAttribute("aria-pressed", "true");
  });
});
