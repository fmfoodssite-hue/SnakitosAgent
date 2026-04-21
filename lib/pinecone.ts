import { Pinecone } from '@pinecone-database/pinecone';

export const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || ''
});

export const index = pc.index(process.env.PINECONE_INDEX || 'agent-index');
