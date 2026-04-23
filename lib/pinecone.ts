import { knowledgeService } from "../services/knowledge.service";

export const index = {
  query: async (_input: unknown) => ({
    matches: (await knowledgeService.retrieve("")).map((item) => ({
      metadata: { text: item.content },
    })),
  }),
};

export default index;
