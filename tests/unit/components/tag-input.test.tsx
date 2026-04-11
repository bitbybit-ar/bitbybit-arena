import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { TagInput } from "@/components/common/TagInput";

function Harness({ initial = [] as string[] }: { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <label htmlFor="t">Tags</label>
      <TagInput id="t" value={value} onChange={setValue} placeholder="add" />
    </>
  );
}

describe("TagInput", () => {
  it("wires the id prop to the underlying input", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    expect(input).toHaveAttribute("id", "t");
  });

  it("adds a tag on Enter", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "fitness" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("fitness")).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("adds a tag on comma", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "reading" } });
    fireEvent.keyDown(input, { key: "," });
    expect(screen.getByText("reading")).toBeInTheDocument();
  });

  it("normalizes to kebab-case lowercase", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hack A Thon" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("hack-a-thon")).toBeInTheDocument();
  });

  it("dedupes identical tags", () => {
    render(<Harness initial={["fitness"]} />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Fitness" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getAllByText("fitness")).toHaveLength(1);
  });

  it("removes the last tag on Backspace when draft is empty", () => {
    render(<Harness initial={["a", "b"]} />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    expect(screen.getByText("b")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(screen.queryByText("b")).not.toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("does not remove tags on Backspace when draft has text", () => {
    render(<Harness initial={["a"]} />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("removes a tag via the chip remove button", () => {
    render(<Harness initial={["fitness"]} />);
    const removeBtn = screen.getByRole("button", { name: /remove fitness/i });
    fireEvent.click(removeBtn);
    expect(screen.queryByText("fitness")).not.toBeInTheDocument();
  });

  it("rejects tags with invalid characters silently", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bad!tag" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Invalid entries are dropped (keeps the bad draft so user can fix)
    expect(screen.queryByText("bad!tag")).not.toBeInTheDocument();
  });

  it("stops adding tags after reaching max", () => {
    const onChange = vi.fn();
    render(
      <TagInput value={["a", "b"]} onChange={onChange} max={2} />
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
