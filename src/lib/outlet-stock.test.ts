import { describe, expect, it } from "vitest";
import { calculateLocationStock } from "./outlet-stock";

describe("inventory after outlet history reset", () => {
  it("excludes removed store history while retaining other movements", () => {
    const openings = [{ location_id: "warehouse", product_id: "product", quantity: 100 }];
    const remaining = [{ from_location_id: "warehouse", to_location_id: "other-store", product_id: "product", quantity: 20 }];
    const removed = [{ from_location_id: "warehouse", to_location_id: "reset-store", product_id: "product", quantity: 15 }];
    expect(calculateLocationStock(openings, [...remaining, ...removed], ["warehouse"]).get("warehouse")?.get("product")).toBe(65);
    const recalculated = calculateLocationStock(openings, remaining, ["warehouse", "other-store", "reset-store"]);
    expect(recalculated.get("warehouse")?.get("product")).toBe(80);
    expect(recalculated.get("other-store")?.get("product")).toBe(20);
    expect(recalculated.get("reset-store")?.get("product") ?? 0).toBe(0);
  });
});