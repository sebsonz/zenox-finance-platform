import { describe, expect, it } from "vitest";
import { addMoney, multiplyMoney, roundMoney } from "../src/domain/money.js";

describe("money primitives", () => {
  it("adds decimal strings without binary floating-point errors", () => {
    expect(addMoney("0.1", "0.2")).toBe("0.3");
  });

  it("multiplies decimal quantity and price exactly", () => {
    expect(multiplyMoney("3", "19.99")).toBe("59.97");
  });

  it("rounds according to the explicit half-up policy", () => {
    expect(roundMoney("12.345", 2)).toBe("12.35");
  });

  it("rejects exponent notation and malformed decimal input", () => {
    expect(() => addMoney("1e3", "1")).toThrow();
    expect(() => addMoney("NaN", "1")).toThrow();
  });
});
