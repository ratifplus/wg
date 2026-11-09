import { afterEach, describe, expect, it, vi } from "vitest";
import { normaliseKey, normalisePhone, reminderText, sendWhatsApp } from "../src/whatsapp";

describe("normalisePhone", () => {
  it("accepts international numbers in common spellings", () => {
    expect(normalisePhone("+49 151 2345 678")).toBe("+491512345678");
    expect(normalisePhone("0049 (151) 234-5678")).toBe("+491512345678");
  });
  it("rejects numbers without a country code", () => {
    expect(normalisePhone("0151 2345678")).toBeNull();
    expect(normalisePhone("+49 12")).toBeNull();
  });
});

describe("normaliseKey", () => {
  it("accepts plain keys only", () => {
    expect(normaliseKey(" 123456 ")).toBe("123456");
    expect(normaliseKey("12 34")).toBeNull();
    expect(normaliseKey("")).toBeNull();
  });
});

describe("reminderText", () => {
  it("names the job, the date and the done link", () => {
    const text = reminderText({ kind: "overdue", chore: "trash", due: "2026-11-06", doneUrl: "https://x/done" });
    expect(text).toContain("*WG Chores · Trash*");
    expect(text).toContain("Overdue since Friday 6 November");
    expect(text).toContain("Mark done: https://x/done");
  });
});

describe("sendWhatsApp", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls CallMeBot with the encoded number, key and text", async () => {
    const fetch = vi.fn(async () => new Response("<p>Message queued. You will receive it in a few seconds.</p>"));
    vi.stubGlobal("fetch", fetch);
    await sendWhatsApp("+491512345678", "123456", "Hi & bye");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.callmebot.com/whatsapp.php?phone=%2B491512345678&apikey=123456&text=Hi%20%26%20bye",
    );
  });

  it("throws on CallMeBot's error pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<b>APIKey is invalid.</b>")));
    await expect(sendWhatsApp("+491512345678", "1", "x")).rejects.toThrow("APIKey is invalid");
  });
});
