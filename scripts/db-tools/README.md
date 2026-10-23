# Công cụ sao lưu, DB test và kiểm thử

Dự án có 2 DB Supabase:

| DB | File cấu hình | Dùng cho |
|---|---|---|
| Thật (`whyulopkxtqlqrhbxdgt`) | `.env` | App nhân viên đang dùng |
| Test (`cdx-test`) | `.env.test` | Thử code và thay đổi DB trước khi đưa lên thật |

Hai file `.env*` không được commit (đã có trong `.gitignore`).

## Sao lưu

Không lưu bản sao lưu ra máy tính (dữ liệu có lương, mật khẩu). Backup tự động hằng ngày
(`daily_backup_telegram.mjs`, GitHub Actions 23:00) gửi lên Telegram 2 file:

- file Excel để đọc;
- `CDX_Full_<ngày>.json.gz`: đủ mọi bảng và cấu trúc DB (cột, ràng buộc, index, RLS policy, trigger,
  hàm), ngày giờ giữ nguyên dạng chuỗi của Postgres. Dùng file này để khôi phục.

## Dựng / làm sạch DB test

```bash
# sao chép thẳng DB thật → DB test trong bộ nhớ (chỉ đọc DB thật, không ghi file ra máy)
node scripts/db-tools/restore_to_test.mjs --from-prod --reset

# hoặc từ file .json.gz tải từ Telegram (xóa file sau khi dùng)
node scripts/db-tools/restore_to_test.mjs CDX_Full_2026-10-23.json.gz --reset
```

Script chỉ ghi vào DB trong `.env.test` và từ chối chạy nếu đó là DB thật. `--reset` xóa toàn bộ bảng và
hàm trong DB test rồi dựng lại.

## Chạy app trên DB test và kiểm thử

```bash
npx vite --mode test --port 5199 --strictPort    # cửa sổ 1: app đọc .env.test
node scripts/db-tools/e2e/run_all.mjs            # cửa sổ 2: toàn bộ bài thử
```

Bài thử đăng nhập bằng tài khoản `admindev`, bấm trên giao diện như người dùng rồi kiểm tra lại DB.
Mọi request tới DB thật đều bị chặn. Các bài thử ghi dữ liệu vào DB test, nên hãy dựng lại DB test sạch
trước mỗi lần chạy. Một số bài dùng dữ liệu cụ thể của bản sao lưu ngày 23/10/2026 (ví dụ phiếu Rã
`XA20260628-2604`); khi dữ liệu thật thay đổi nhiều thì cần chỉnh lại.

Ảnh chụp màn hình khi lỗi nằm trong thư mục tạm của hệ điều hành: `cdx-e2e-shots`.
