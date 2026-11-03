import type { AddressInfo } from "node:net";
import { Server } from "proxy-chain";

/**
 * Unauthenticated loopback proxy that chains to the profile's upstream (HTTP/HTTPS/SOCKS, with auth).
 * The browser only knows this endpoint, so an upstream failure surfaces as a connection error
 * instead of falling back to the machine's own IP.
 */
export class Forwarder {
  readonly #server: Server;
  readonly url: string;

  private constructor(server: Server, url: string) {
    this.#server = server;
    this.url = url;
  }

  static async start(upstreamUrl: string): Promise<Forwarder> {
    const server = new Server({
      host: "127.0.0.1",
      port: 0,
      prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl }),
    });
    await server.listen();
    const { port } = server.server.address() as AddressInfo;
    return new Forwarder(server, `http://127.0.0.1:${port}`);
  }

  async close(): Promise<void> {
    await this.#server.close(true);
  }
}
