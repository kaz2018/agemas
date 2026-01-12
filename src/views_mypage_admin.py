import streamlit as st
from src.config import db
import pandas as pd

def my_page_view():
    user = st.session_state.user
    st.title("マイページ")

    st.markdown("### プロフィール")
    st.write(f"**名前**: {user['name']}")
    st.write(f"**登録日**: {user.get('created_at', '不明')}")
    st.write(f"**状態**: {user.get('status', 'active')}")

    st.divider()

    # History
    st.markdown("### 取引履歴")

    all_posts = db.get_all_posts()

    # My Posts
    my_posts = [p for p in all_posts if p['user_id'] == user['user_id']]

    # Received Posts (where decided_user_id is me)
    received_posts = [p for p in all_posts if p.get('decided_user_id') == user['user_id']]

    tab1, tab2 = st.tabs(["自分の投稿", "受け取ったもの"])

    with tab1:
        if not my_posts:
            st.info("投稿はありません。")
        else:
            for post in my_posts:
                 with st.expander(f"{post['title']} ({post['status']}) - {post['created_at']}"):
                     st.write(post['description'])
                     if st.button("詳細へ", key=f"my_hist_{post['post_id']}"):
                        st.session_state.current_page = "post_detail"
                        st.session_state.selected_post_id = post['post_id']
                        st.rerun()

    with tab2:
        if not received_posts:
            st.info("受け取ったものはありません。")
        else:
            for post in received_posts:
                 with st.expander(f"{post['title']} (from {post['user_name']}) - {post['created_at']}"):
                     st.write(post['description'])
                     if st.button("詳細へ", key=f"recv_hist_{post['post_id']}"):
                        st.session_state.current_page = "post_detail"
                        st.session_state.selected_post_id = post['post_id']
                        st.rerun()

def admin_page_view():
    st.title("管理画面")

    tab1, tab2 = st.tabs(["ログ検索", "ユーザー管理"])

    with tab1:
        st.subheader("ログ検索")

        col1, col2 = st.columns(2)
        with col1:
            search_user_id = st.text_input("ユーザーID")

        logs = db.get_logs({"user_id": search_user_id})

        # Convert to dataframe for easier viewing
        if logs:
            df = pd.DataFrame(logs)
            st.dataframe(df, use_container_width=True)
        else:
            st.info("ログが見つかりません。")

    with tab2:
        st.subheader("ユーザー管理")

        # List users (Hack: read mock file directly or use db interface extended?
        # Interface get_user_by_name returns one. We need list all.
        # DB interface was minimal. I should probably add get_all_users to interface or just rely on search.
        # But for now, let's implement a simple user search by name to suspend.)

        target_name = st.text_input("ユーザー名を検索")
        if st.button("検索"):
            target_user = db.get_user_by_name(target_name)
            if target_user:
                st.write(f"ID: {target_user['user_id']}")
                st.write(f"Name: {target_user['name']}")
                st.write(f"Status: {target_user.get('status', 'active')}")

                if target_user.get('status') != 'suspended':
                    if st.button("このユーザーを停止する"):
                        db.update_user_status(target_user['user_id'], "suspended")
                        db.log_action("user_suspended", st.session_state.user['user_id'], None, None, {"target_user": target_user['user_id']})
                        st.success("ユーザーを停止しました。")
                        st.rerun()
                else:
                    if st.button("停止を解除する"):
                        db.update_user_status(target_user['user_id'], "active")
                        db.log_action("user_unsuspended", st.session_state.user['user_id'], None, None, {"target_user": target_user['user_id']})
                        st.success("ユーザーの停止を解除しました。")
                        st.rerun()
            else:
                st.error("ユーザーが見つかりません。")
