import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------
function defaultProps(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  return {
    title: "Destroy Pool",
    message: "This will permanently destroy the pool and all its data.",
    confirmValue: "tank",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: simulate typing into an input via fireEvent
// ---------------------------------------------------------------------------
function typeInto(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ConfirmDialog", () => {
  it("renders the title, message, and confirm target", () => {
    render(<ConfirmDialog {...defaultProps()} />);

    expect(screen.getByText("Destroy Pool")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This will permanently destroy the pool and all its data.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("tank")).toBeInTheDocument();
  });

  it("shows the default confirm label 'Destroy'", () => {
    render(<ConfirmDialog {...defaultProps()} />);

    expect(
      screen.getByRole("button", { name: "Destroy" }),
    ).toBeInTheDocument();
  });

  it("shows a custom confirm label when provided", () => {
    render(
      <ConfirmDialog {...defaultProps({ confirmLabel: "Delete Forever" })} />,
    );

    expect(
      screen.getByRole("button", { name: "Delete Forever" }),
    ).toBeInTheDocument();
  });

  it("has the confirm button disabled by default (empty input)", () => {
    render(<ConfirmDialog {...defaultProps()} />);

    const confirmBtn = screen.getByRole("button", { name: "Destroy" });
    expect(confirmBtn).toBeDisabled();
  });

  it("enables the confirm button only when input matches confirmValue exactly", () => {
    render(<ConfirmDialog {...defaultProps()} />);

    const input = screen.getByPlaceholderText("tank");
    const confirmBtn = screen.getByRole("button", { name: "Destroy" });

    // Partial match -- still disabled
    typeInto(input, "tan");
    expect(confirmBtn).toBeDisabled();

    // Full match -- enabled
    typeInto(input, "tank");
    expect(confirmBtn).toBeEnabled();
  });

  it("disables the confirm button when input is a case-different mismatch", () => {
    render(<ConfirmDialog {...defaultProps()} />);

    const input = screen.getByPlaceholderText("tank");
    const confirmBtn = screen.getByRole("button", { name: "Destroy" });

    typeInto(input, "Tank");
    expect(confirmBtn).toBeDisabled();
  });

  it("re-disables the confirm button when the user clears the input", () => {
    render(<ConfirmDialog {...defaultProps()} />);

    const input = screen.getByPlaceholderText("tank");
    const confirmBtn = screen.getByRole("button", { name: "Destroy" });

    typeInto(input, "tank");
    expect(confirmBtn).toBeEnabled();

    typeInto(input, "");
    expect(confirmBtn).toBeDisabled();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps({ onConfirm })} />);

    const input = screen.getByPlaceholderText("tank");
    typeInto(input, "tank");

    const confirmBtn = screen.getByRole("button", { name: "Destroy" });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps({ onCancel })} />);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the overlay backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog {...defaultProps({ onCancel })} />,
    );

    // The overlay is the outermost div rendered by the component.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const overlay = container.firstElementChild!;
    fireEvent.click(overlay);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onCancel when clicking inside the dialog content", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps({ onCancel })} />);

    // Click on the title text inside the dialog -- event propagation is
    // stopped by the inner dialog div's onClick handler.
    fireEvent.click(screen.getByText("Destroy Pool"));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables input and buttons when loading is true", () => {
    render(
      <ConfirmDialog {...defaultProps({ loading: true })} />,
    );

    const input = screen.getByPlaceholderText("tank");
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmBtn = screen.getByRole("button", { name: "Working..." });

    expect(input).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    expect(confirmBtn).toBeDisabled();
  });

  it("shows 'Working...' on the confirm button when loading", () => {
    render(
      <ConfirmDialog {...defaultProps({ loading: true })} />,
    );

    expect(
      screen.getByRole("button", { name: "Working..." }),
    ).toBeInTheDocument();
  });

  it("keeps confirm button disabled when loading even if input matches", () => {
    const props = defaultProps({ loading: false });
    const { rerender } = render(<ConfirmDialog {...props} />);

    const input = screen.getByPlaceholderText("tank");
    typeInto(input, "tank");

    // Confirm should be enabled before loading
    expect(screen.getByRole("button", { name: "Destroy" })).toBeEnabled();

    // Switch to loading
    rerender(<ConfirmDialog {...defaultProps({ loading: true })} />);

    expect(
      screen.getByRole("button", { name: "Working..." }),
    ).toBeDisabled();
  });

  it("has an input with autoFocus", () => {
    render(<ConfirmDialog {...defaultProps()} />);

    const input = screen.getByPlaceholderText("tank");
    // jsdom honours the autoFocus attribute
    expect(input).toHaveFocus();
  });

  it("does not fire onConfirm when button is disabled and force-clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps({ onConfirm })} />);

    const confirmBtn = screen.getByRole("button", { name: "Destroy" });

    // Button is disabled (empty input), click should be a no-op
    fireEvent.click(confirmBtn);

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
