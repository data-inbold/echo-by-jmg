# Shopify Files: cấu trúc folder Website

Tạo trong Shopify Admin > Content > Files (API chưa hỗ trợ folder).
Chuyển file vào folder KHÔNG đổi tên file, nên tham chiếu `shopify://shop_images/<tên file>` trong theme vẫn giữ nguyên.

```
Website/
  Global/            (header, footer, logo, giftcard)
  Homepage/          (index.json)
  Collections/       (list-collections + banner collection)
  Pages/
    Contact/
    Factory/
    Yarn-Passport/
  Shared/            (ảnh dùng ở nhiều trang)
  Carousel/
```

| File | Folder | Dùng ở |
|---|---|---|
| Logo_W-13.5.26.png | Website/Global | settings_data.json, echo-header-group.json |
| EchoByJMG-Rdlogo.png | Website/Global | settings_data.json |
| EchoByJMG-Rdlogo_W.png | Website/Global | footer-group.json |
| EchoByJMG-eGiftcard.png | Website/Global | settings_data.json |
| mum_and_girl_hugging_the_cushion2.jpg | Website/Global | footer-group.json |
| EchoByJMG-70_Large_...jpg, EchoByJMG-71_Large_...jpg, EchoByJMG-82_Large_...jpg | Website/Global | settings_data.json |
| PillowTalk-CollectionBanner.jpg, JMG_NOV_mood_shot46642.jpg, Thoughtful_Gift_Ideas-Banner.png | Website/Collections | settings_data.json |
| Blankets.png, Cushion_Covers.png, Bags.png, ACCESSORIES.png | Website/Collections | index.json, list-collections.json |
| Rectangle_6.png, how-it-works-yarn-image.png, giftsection.png | Website/Homepage | index.json |
| Join_the_Cozy_Club.png | Website/Shared | index, contact, factory, yarn-passport |
| gift-image.png | Website/Pages/Contact | page.contact.json |
| factory.png | Website/Pages/Factory | page.factory.json |
| read_your_yarn_passport.png, yarn-passport-*.png (6 file) | Website/Pages/Yarn-Passport | page.yarn-passport.json |
| carousel1..7.png | Website/Carousel | chưa thấy trong repo |
| Image.png, Screenshot_2026-11-25_at_15.04.03.png | Không dùng trong theme: xác nhận rồi xoá | |

Lưu ý: KHÔNG đổi tên file khi di chuyển. Nếu muốn đổi tên (vd. Image.png), phải sửa đường dẫn tương ứng trong JSON.
