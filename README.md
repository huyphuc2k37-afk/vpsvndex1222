# VPSVNDEX

Landing page bán VPS tiếng Việt, không có backend hoặc xử lý thanh toán tự động. Người mua chọn VPS Việt Nam / US, chọn cấu hình, sau đó xem số tiền và thông tin chuyển khoản MB Bank.

## Chạy thử trên máy

Đây là website tĩnh, không cần cài package. Mở `index.html` bằng trình duyệt, hoặc dùng VS Code Live Server để có trải nghiệm tốt nhất.

## Đăng ký / đăng nhập (Supabase)

Trang dùng Supabase để xác thực email + mật khẩu. Mở `supabase-config.js` và điền hai giá trị lấy từ **Supabase Dashboard → Project → Settings → API**:

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT-ID.supabase.co",
  anonKey: "YOUR-ANON-KEY",
};
```

Trong Supabase Dashboard bật **Authentication → Providers → Email** (mặc định đã bật). Tuỳ chọn: bật **Confirm email** nếu muốn người dùng xác nhận email trước khi đăng nhập lần đầu.

Nếu chưa cấu hình, trang vẫn chạy bình thường nhưng nút đăng nhập/đăng ký sẽ báo lỗi trong modal.

## Đưa lên GitHub Pages với tên miền `vpsvndex.click`

1. Tạo một repository GitHub mới (ví dụ: `vpsvndex`) rồi đưa **toàn bộ nội dung trong thư mục này** lên nhánh `main`.
2. Trên GitHub mở **Settings → Pages**, chọn **GitHub Actions** làm nguồn triển khai. Workflow có sẵn trong `.github/workflows/deploy-pages.yml` sẽ tự xuất bản sau mỗi lần đẩy mã lên `main`.
3. Trong **Settings → Pages → Custom domain**, nhập `vpsvndex.click`. Vì dự án dùng GitHub Actions để triển khai, thiết lập trong trang Pages là nơi GitHub ghi nhận tên miền; tệp `CNAME` cũng được giữ lại để tương thích nếu sau này chuyển sang xuất bản từ nhánh.
4. Tại nhà cung cấp tên miền, tạo bốn bản ghi `A` cho tên miền gốc trỏ lần lượt đến `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; đồng thời tạo bản ghi `CNAME` cho `www` trỏ đến `<ten-tai-khoan-github>.github.io`.
5. Chờ DNS cập nhật, sau đó bật **Enforce HTTPS** trong trang Pages.

GitHub Pages sẽ cấp HTTPS miễn phí sau khi DNS hợp lệ. Thay `<ten-tai-khoan-github>` bằng tên tài khoản GitHub của bạn.

## Chỉnh sửa nhanh

- Gói VPS, cấu hình và giá: `app.js`
- Nội dung / giao diện: `index.html` và `style.css`
- Mã QR thanh toán: `public/mbbank-qr.png`
- Thông tin tài khoản nhận: tìm `2154050602` trong `index.html`

Lưu ý: trang chỉ hướng dẫn người mua chuyển khoản. Nó không tự xác nhận thanh toán hoặc tự tạo VPS.
