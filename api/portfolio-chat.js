import { handlePortfolioChat } from "../server/do-song/portfolioChatApi.js";

export default async function handler(req, res) {
  await handlePortfolioChat(req, res, req.url);
}
