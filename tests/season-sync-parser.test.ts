import { describe, expect, it } from "vitest";
import { parseSeasonAnnouncement, steamMarkupToText } from "../app/lib/season-sync-parser";

describe("season announcement parser", () => {
  it("extracts the season boundary and new weapons from an official Steam announcement", () => {
    const parsed = parseSeasonAnnouncement({
      gid: "s12-test",
      date: Date.parse("2026-11-10T09:00:00Z") / 1000,
      title: 'Version Update: New Season "Aurora"',
      url: "https://steamcommunity.com/example",
      contents: `[p]We will launch our brand-new season: "Aurora" on November 12.[/p]
        [b]New Weapons - XM8 Assault Rifle, Vector SMG[/b]
        [p]● Added XM8 Assault Rifle.[/p]
        [p]● S12 Season Mission Update: Season 12 kicks off.[/p]`,
    });

    expect(parsed).toMatchObject({
      seasonCode: "S12",
      seasonName: "Aurora",
      startsAt: "2026-11-12T00:00:00+08:00",
      weapons: [
        { canonicalName: "XM8", weaponType: "突击步枪" },
        { canonicalName: "Vector", weaponType: "冲锋枪" },
      ],
    });
  });

  it("recognizes a complete season announcement without new weapons", () => {
    expect(parseSeasonAnnouncement({
      gid: "season-only",
      date: Date.parse("2026-11-10T09:00:00Z") / 1000,
      title: 'Version Update: New Season "Aurora"',
      url: "https://steamcommunity.com/example",
      contents: '[p]We will launch our brand-new season: "Aurora" on November 12.[/p][p]S12 Season Mission Update: Season 12 kicks off.[/p]',
    })).toMatchObject({
      seasonCode: "S12",
      seasonName: "Aurora",
      startsAt: "2026-11-12T00:00:00+08:00",
      weapons: [],
    });
  });

  it("returns null for ordinary updates without a complete season evidence chain", () => {
    expect(parseSeasonAnnouncement({
      gid: "weekly",
      date: Date.now() / 1000,
      title: "Weekly Update",
      url: "https://steamcommunity.com/example",
      contents: "New weapon appearance: M4A1. Event starts tomorrow.",
    })).toBeNull();
  });

  it("strips Steam markup while keeping readable line boundaries", () => {
    expect(steamMarkupToText("[p]First[/p][p][b]Second[/b][/p]")).toContain("First\nSecond");
  });
});
