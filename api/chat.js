const supabase = require('../lib/supabase');
const openai = require('../lib/ai');
const { index } = require('../lib/pinecone');
const { getOrderStatus } = require('../lib/shopify');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, userId, shop } = req.body;

  try {
    // 1. PINECONE: Retrieve relevant knowledge base context
    const queryResponse = await index.query({
      vector: Array(1536).fill(0), // In reality, you'd embed the user's message here
      topK: 3,
      includeMetadata: true,
    });

    const context = queryResponse.matches
      .map(match => match.metadata.text)
      .join('\n');

    // 2. SHOPIFY: Real-time Order Tracking (if order number present)
    let orderDetails = '';
    const orderMatch = message.match(/#\d+/);
    if (orderMatch) {
      const orderId = orderMatch[0].replace('#', '');
      const order = await getOrderStatus(orderId);
      if (order) {
        orderDetails = `\nReal-time Order Status for ${orderMatch[0]}: ${order.financial_status}, Fulfillment: ${order.fulfillment_status}`;
      }
    }

    // 3. OPENAI: Generate Response with Context and Real-time Data
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `You are a helpful assistant for a Shopify store. Use this context: ${context}` },
        { role: "user", content: message + orderDetails },
      ],
    });

    const aiResponse = completion.choices[0].message.content;

    // 4. SUPABASE: Track the interaction
    await supabase.from('chats').insert([
      { user_id: userId, message, response: aiResponse, shop, created_at: new Date() }
    ]);

    res.status(200).json({ response: aiResponse });
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: 'Failed to process chat' });
  }
};
