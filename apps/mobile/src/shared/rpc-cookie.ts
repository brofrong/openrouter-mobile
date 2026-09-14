type RpcCallOptions = {
  readonly headers?: { readonly [key: string]: string };
};

/**
 * Put the Better Auth cookie on the RPC envelope, not only the HTTP/WS
 * transport. Android WebSocket handshake often drops `Cookie`, so ChatSubscribe
 * would hit UNAUTHORIZED while HTTP ChatList still worked.
 */
export const withCookieOptions = (
  cookie: string,
  opts?: RpcCallOptions,
): RpcCallOptions | undefined => {
  if (cookie.length === 0) {
    return opts;
  }
  return {
    ...opts,
    headers: {
      cookie,
      ...opts?.headers,
    },
  };
};
