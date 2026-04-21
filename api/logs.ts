import { VercelRequest, VercelResponse } from '@vercel/node';
import supabase from '../lib/supabase';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') {
    // Fetch logs for the admin dashboard
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    // Log an admin action
    const { action, details, adminId } = req.body;
    const { error } = await supabase
      .from('admin_logs')
      .insert([{ action, details, admin_id: adminId, created_at: new Date() }]);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
