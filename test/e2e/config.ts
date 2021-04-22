import { Browser, Page } from "puppeteer";
export type Tests = Array<{
  name: string; // Name of the screenshot, without the extension like for example 'example-basic'
  url: string; // Url of the page to take in screenshot
  waitFor?: number; // Time to wait in ms before to take the screenshot
  scenario?: (browser: Browser, page: Page) => Promise<void>;
  failureThreshold?: number; // between 0 and 1, it's a percent. By default it's 0.
}>;

export const tests: Tests = [
  { name: "drag", url: "http://localhost:8000/drag.html" },
  { name: "gexf", url: "http://localhost:8000/gexf.html" },
  { name: "settings", url: "http://localhost:8000/settings.html" },
  {
    name: "settings-mouse-zoom",
    url: "http://localhost:8000/settings.html",
    waitFor: 2000,
    scenario: async (browser: Browser, page: Page): Promise<void> => {
      await page.evaluate(() => {
        const element: any = document.getElementsByClassName("sigma-mouse")[0];
        const cEvent: any = new Event("wheel");
        cEvent.clientX = 0;
        cEvent.clientY = 0;
        cEvent.deltaY = -100;
        element.dispatchEvent(cEvent);
      });
    },
  },
  { name: "tiny", url: "http://localhost:8000/tiny.html" },
  { name: "edge-labels", url: "http://localhost:8000/edge-labels.html" },
  {
    name: "node-edge-state",
    url: "http://localhost:8000/edge-labels.html",
    waitFor: 2000,
    scenario: async (browser: Browser, page: Page): Promise<void> => {
      await page.evaluate(() => {
        window.graph.setNodeAttribute("Alice", "highlighted", true);
        window.graph.setNodeAttribute("Bob", "size", 50);
        window.graph.setNodeAttribute("Bob", "color", "#FF0000");
        window.graph.setNodeAttribute("Deborah", "hidden", true);
        window.graph.setEdgeAttribute("Alice", "Bob", "hidden", true);
      });
    },
  },
];
