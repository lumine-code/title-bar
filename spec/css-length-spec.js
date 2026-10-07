const resolveCSSLength = require("../lib/css-length");

describe("title-bar CSS lengths", () => {
  it("resolves em and calc lengths using the title bar's font size", () => {
    const element = document.createElement("div");
    element.style.fontSize = "20px";
    jasmine.attachToDOM(element);
    try {
      const children = element.childElementCount;
      expect(resolveCSSLength(element, "1.5em", 8)).toBe(30);
      expect(resolveCSSLength(element, "calc(1em + 4px)", 8)).toBe(24);
      expect(element.childElementCount).toBe(children);
    } finally {
      element.remove();
    }
  });

  it("uses the fallback for empty, invalid or intrinsic sizes rather than measuring auto width", () => {
    const element = document.createElement("div");
    element.style.width = "500px";
    jasmine.attachToDOM(element);
    try {
      for (const value of ["", " ", "invalid", "auto", "inherit"]) {
        expect(resolveCSSLength(element, value, 8)).toBe(8);
      }
      expect(resolveCSSLength(element, "0", 8)).toBe(0);
      expect(element.childElementCount).toBe(0);
    } finally {
      element.remove();
    }
  });

  it("resolves detached pixel values and falls back for lengths that require layout", () => {
    const element = document.createElement("div");
    expect(resolveCSSLength(element, " 12.5px ", 8)).toBe(12.5);
    expect(resolveCSSLength(element, "0", 8)).toBe(0);
    expect(resolveCSSLength(element, "2em", 8)).toBe(8);
    expect(resolveCSSLength(element, "calc(10px + 5px)", 8)).toBe(8);
    expect(resolveCSSLength(element, "-1px", 8)).toBe(8);
  });
});
