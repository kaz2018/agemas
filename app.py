import streamlit as st
from src.config import db, storage
from src.auth import check_password, hash_password
import datetime

# --- Constants & Config ---
PAGE_TITLE = "あげますサイト"

st.set_page_config(page_title=PAGE_TITLE, layout="wide")

# --- Session State Initialization ---
def init_session_state():
    if "user" not in st.session_state:
        st.session_state.user = None # Dict containing user info if logged in

# --- Views ---

def login_view():
    st.title(f"{PAGE_TITLE} - ログイン")

    with st.form("login_form"):
        name = st.text_input("ユーザー名（実名）")
        password = st.text_input("パスワード", type="password")
        submitted = st.form_submit_button("ログイン")

        if submitted:
            user = db.get_user_by_name(name)
            if user:
                if user.get("status") == "suspended":
                    st.error("このアカウントは停止されています。運営者にお問い合わせください。")
                elif check_password(password, user["password_hash"]):
                    st.session_state.user = user
                    st.success("ログインしました！")
                    st.rerun()
                else:
                    st.error("パスワードが間違っています。")
            else:
                st.error("ユーザーが見つかりません。")

    # For dev purposes, show a hint if using mock and no users exist
    # This is helpful for the first run
    import os
    if os.getenv("USE_MOCK", "True") == "True":
        st.info("開発用ヒント: 初回起動時はユーザーが存在しません。'admin'ユーザーを作成するスクリプトを実行するか、テストデータを投入してください。")

def logout():
    st.session_state.user = None
    st.rerun()

# --- Main App Logic ---

def main():
    init_session_state()

    if not st.session_state.user:
        login_view()
        return

    # Sidebar Navigation
    st.sidebar.title(f"ようこそ、{st.session_state.user['name']}さん")

    menu = st.sidebar.radio("メニュー", ["投稿一覧", "新規投稿", "マイページ", "管理画面"])

    if st.sidebar.button("ログアウト"):
        logout()

    # Handle page routing logic manually for detail view which isn't in sidebar
    if "current_page" in st.session_state and st.session_state.current_page == "post_detail":
        # Import here to avoid circular dependencies if any (though structured well it shouldn't be an issue)
        from src.views_detail import post_detail_view
        if st.button("◀ 戻る"):
            st.session_state.current_page = None
            st.session_state.selected_post_id = None
            st.rerun()
        post_detail_view(st.session_state.selected_post_id)
        return

    from src.views_dashboard import dashboard_view, create_post_view
    from src.views_mypage_admin import my_page_view, admin_page_view

    if menu == "投稿一覧":
        dashboard_view()
    elif menu == "新規投稿":
        create_post_view()
    elif menu == "マイページ":
        my_page_view()
    elif menu == "管理画面":
        # Admin check using role if available, fallback to specific names for legacy/safety
        user = st.session_state.user
        is_admin = user.get('role') == 'admin' or user['name'] in ['admin', 'Katsushi']

        if is_admin:
             admin_page_view()
        else:
            st.error("権限がありません。")

if __name__ == "__main__":
    main()
