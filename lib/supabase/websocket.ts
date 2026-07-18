import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";

/** Node 20 transport required by the current Supabase client initialiser. */
export const serverWebSocket =
  WebSocket as unknown as WebSocketLikeConstructor;
