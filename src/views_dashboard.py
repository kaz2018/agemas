import streamlit as st
import uuid
from src.config import db, storage
import datetime

def dashboard_view():
    st.title("投稿一覧")

    # Filters
    col1, col2, col3 = st.columns(3)
    with col1:
        search_query = st.text_input("検索", placeholder="キーワードを入力")
    with col2:
        category_filter = st.selectbox("カテゴリ", ["全て", "衣類", "子ども用品", "家具", "家電", "その他"])
    with col3:
        status_filter = st.selectbox("ステータス", ["募集中", "全て"])

    # Get posts
    all_posts = db.get_all_posts()

    # Filter Logic
    filtered_posts = []
    for post in all_posts:
        # Status Filter
        if status_filter == "募集中" and post['status'] != "open":
            continue

        # Category Filter
        if category_filter != "全て" and post['category'] != category_filter:
            continue

        # Search Filter
        if search_query:
            query = search_query.lower()
            if query not in post['title'].lower() and query not in post['description'].lower():
                continue

        filtered_posts.append(post)

    # Sort by created_at desc
    filtered_posts.sort(key=lambda x: x['created_at'], reverse=True)

    st.write(f"全{len(filtered_posts)}件")

    # Display Posts
    for post in filtered_posts:
        with st.container(border=True):
            cols = st.columns([1, 3])
            with cols[0]:
                if post['images']:
                    # Assuming images is a string URL or list of URLs.
                    # Requirements say "images (URL)" in CSV, but "images (max 3)" in feature.
                    # Let's assume list of strings for now, or CSV string.
                    # Design doc table says "https://storage/..." so likely a single string?
                    # "images (max 3)" suggests multiple. Let's assume comma separated string or list in JSON.
                    imgs = post['images']
                    if isinstance(imgs, str):
                        img_url = imgs.split(',')[0] # Get first
                    elif isinstance(imgs, list) and len(imgs) > 0:
                        img_url = imgs[0]
                    else:
                        img_url = None

                    if img_url:
                        st.image(img_url, use_container_width=True)
                    else:
                        st.text("No Image")

            with cols[1]:
                st.subheader(post['title'])
                st.caption(f"カテゴリ: {post['category']} | 投稿者: {post['user_name']} | {post['created_at']}")

                status_map = {
                    "open": "募集中",
                    "decided": "受け取り決定",
                    "completed": "完了",
                    "cancelled": "キャンセル"
                }
                # st.badge does not exist in this version
                status_label = status_map.get(post['status'], post['status'])
                if post['status'] == 'open':
                    st.success(status_label)
                elif post['status'] == 'decided':
                    st.warning(status_label)
                else:
                    st.info(status_label)

                if st.button("詳細を見る", key=f"btn_detail_{post['post_id']}"):
                    st.session_state.current_page = "post_detail"
                    st.session_state.selected_post_id = post['post_id']
                    st.rerun()

def create_post_view():
    st.title("新規投稿")

    with st.form("create_post_form"):
        title = st.text_input("タイトル (100文字以内)", max_chars=100)
        category = st.selectbox("カテゴリ", ["衣類", "子ども用品", "家具", "家電", "その他"])
        description = st.text_area("説明 (1000文字以内)", max_chars=1000, height=200)

        uploaded_files = st.file_uploader("写真 (最大3枚)", type=['png', 'jpg', 'jpeg'], accept_multiple_files=True)

        submitted = st.form_submit_button("投稿する")

        if submitted:
            if not title:
                st.error("タイトルは必須です。")
                return
            if uploaded_files and len(uploaded_files) > 3:
                st.error("写真は最大3枚までです。")
                return

            image_urls = []
            if uploaded_files:
                for f in uploaded_files:
                    # Generate a unique filename
                    ext = f.name.split('.')[-1]
                    filename = f"{uuid.uuid4()}.{ext}"
                    url = storage.upload_image(f, filename)
                    image_urls.append(url)

            post_data = {
                "user_id": st.session_state.user['user_id'],
                "user_name": st.session_state.user['name'],
                "title": title,
                "description": description,
                "category": category,
                "images": image_urls, # Store as list in JSON. If CSV, join with comma.
                "status": "open"
            }

            new_id = db.create_post(post_data)

            # Log
            db.log_action("post_created", st.session_state.user['user_id'], new_id, None, {"title": title})

            st.success("投稿しました！")
            st.session_state.current_page = "dashboard" # Go back to dashboard logic?
            # Or just clear form? Rerunning to clear form is easier if we redirect.
            st.rerun()
