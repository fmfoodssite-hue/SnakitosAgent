import { VercelRequest, VercelResponse } from '@vercel/node';

export default (req: VercelRequest, res: VercelResponse) => {
  res.status(200).json({
    message: "Agent API is running (TypeScript)",
    timestamp: new Date().toISOString()
  });
};
