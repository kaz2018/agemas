export type Item = {
  id: string;
  owner: string; // record<user> の文字列表現
  title: string;
  description: string;
  images: string[]; // R2のキー
  status: "available" | "negotiating" | "transferred";
  created_at: string;
  updated_at: string;
  // JOINして取得するフィールド
  owner_user_id?: string;
  owner_name?: string;
  requester_user_id?: string; // negotiating状態のとき希望者の会員ID
  requester_name?: string; // negotiating状態のとき希望者の名前
};

export type Want = {
  id: string;
  item: string;
  requester: string;
  created_at: string;
  // JOINして取得するフィールド
  requester_user_id?: string;
  requester_name?: string;
};
