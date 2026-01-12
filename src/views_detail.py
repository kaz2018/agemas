import streamlit as st
from src.config import db, storage
import datetime

def post_detail_view(post_id):
    post = db.get_post_by_id(post_id)
    if not post:
        st.error("投稿が見つかりません。")
        return

    st.title(post['title'])

    # Images
    imgs = post.get('images', [])
    if imgs:
        if isinstance(imgs, str):
            imgs = [imgs] # Legacy check

        cols = st.columns(len(imgs))
        for i, img_url in enumerate(imgs):
            with cols[i]:
                st.image(img_url, use_container_width=True)

    # Info
    st.markdown("### 基本情報")
    st.write(f"**投稿者**: {post['user_name']}")
    st.write(f"**カテゴリ**: {post['category']}")
    st.write(f"**投稿日**: {post['created_at']}")

    status_map = {
        "open": "募集中",
        "decided": "受け取り決定",
        "completed": "完了",
        "cancelled": "キャンセル"
    }
    st.write(f"**状態**: {status_map.get(post['status'], post['status'])}")

    if post.get('decided_user_id'):
        # Maybe fetch name?
        st.write(f"**決定相手ID**: {post['decided_user_id']}")

    st.markdown("### 説明")
    st.write(post['description'])

    st.divider()

    # Replies / Thread
    st.markdown("### 返信")

    replies = db.get_replies_by_post_id(post_id)
    replies.sort(key=lambda x: x['created_at']) # Oldest first usually for threads? Or newest? Design doc says "Timeline", implies chronological.

    current_user_id = st.session_state.user['user_id']
    is_owner = (post['user_id'] == current_user_id)

    for reply in replies:
        with st.chat_message("user"):
            st.write(f"**{reply['user_name']}** ({reply['created_at']})")
            st.write(reply['message'])
            if reply.get('image'):
                 st.image(reply['image'], width=200)

            # Status badge for reply
            if reply['status'] == 'accepted':
                st.success("了承済み (受け取り決定)")
            elif reply['status'] == 'declined':
                st.caption("辞退")

            # Action Buttons for Owner
            if is_owner and post['status'] == 'open' and reply['status'] == 'proposed':
                col_a, col_b = st.columns(2)
                with col_a:
                    if st.button("了承", key=f"accept_{reply['reply_id']}"):
                        # Update Post status
                        db.update_post_status(post_id, "decided", reply['user_id'])
                        # Update Reply status
                        db.update_reply_status(reply['reply_id'], "accepted")
                        # Log
                        db.log_action("status_changed", current_user_id, post_id, reply['reply_id'], {"new_status": "decided"})
                        st.success("了承しました。")
                        st.rerun()
                with col_b:
                    if st.button("辞退扱いにする", key=f"decline_{reply['reply_id']}"):
                         db.update_reply_status(reply['reply_id'], "declined")
                         st.rerun()

    # Status Management (Owner only)
    if is_owner:
        st.divider()
        st.markdown("### 投稿管理")
        current_status = post['status']

        # If decided, can move to completed
        if current_status == "decided":
            if st.button("取引完了にする"):
                db.update_post_status(post_id, "completed")
                db.log_action("status_changed", current_user_id, post_id, None, {"new_status": "completed"})
                st.success("取引を完了しました。")
                st.rerun()

        # If open, can cancel
        if current_status == "open":
             if st.button("投稿をキャンセル（削除）"):
                 # Requirements say "Delete" but also "Log".
                 # Usually soft delete or status cancelled.
                 # FR-2.4 says "Delete". Let's use cancelled status for now as it preserves data better.
                 db.update_post_status(post_id, "cancelled")
                 db.log_action("post_cancelled", current_user_id, post_id, None, {})
                 st.success("投稿をキャンセルしました。")
                 st.rerun()


    # Reply Form
    # Only if status is open (or maybe user can still reply? Requirements say "decided" stops it usually)
    # FR-3.1 says "Login required".
    if post['status'] == 'open':
        st.divider()
        st.markdown("### 返信を投稿")

        with st.form(f"reply_form_{post_id}"):
            msg = st.text_area("メッセージ (500文字以内)", max_chars=500)
            img = st.file_uploader("画像 (任意)", type=['png', 'jpg', 'jpeg'])
            submitted = st.form_submit_button("送信")

            if submitted:
                if not msg:
                    st.error("メッセージを入力してください。")
                else:
                    img_url = None
                    if img:
                        import uuid
                        ext = img.name.split('.')[-1]
                        filename = f"{uuid.uuid4()}.{ext}"
                        img_url = storage.upload_image(img, filename)

                    reply_data = {
                        "post_id": post_id,
                        "user_id": current_user_id,
                        "user_name": st.session_state.user['name'],
                        "message": msg,
                        "image": img_url,
                        "status": "proposed"
                    }

                    new_reply_id = db.create_reply(reply_data)
                    db.log_action("reply_created", current_user_id, post_id, new_reply_id, {"message": msg})

                    st.success("返信しました。")
                    st.rerun()
    elif post['status'] != 'open':
        st.info("この投稿は現在募集中ではありません。")
