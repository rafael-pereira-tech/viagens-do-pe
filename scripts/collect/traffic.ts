import type { Page, Request, Response } from '@playwright/test';

/** Bytes from request bodies and response Content-Length. Framing overhead is not included. */
export class TrafficMeter {
  bytesIn = 0;
  bytesOut = 0;

  private readonly onRequest = (req: Request) => {
    const post = req.postData();
    if (post) this.bytesOut += Buffer.byteLength(post);
  };

  private readonly onResponse = (res: Response) => {
    const len = Number(res.headers()['content-length']);
    if (Number.isFinite(len) && len > 0) this.bytesIn += len;
  };

  attach(page: Page): void {
    page.on('request', this.onRequest);
    page.on('response', this.onResponse);
  }

  detach(page: Page): void {
    page.off('request', this.onRequest);
    page.off('response', this.onResponse);
  }

  take(): { bytesIn: number; bytesOut: number } {
    const snap = { bytesIn: this.bytesIn, bytesOut: this.bytesOut };
    this.bytesIn = 0;
    this.bytesOut = 0;
    return snap;
  }
}
