# Katkı

Katkın için teşekkürler! Hata bildirimi, öneri ve pull request'ler memnuniyetle karşılanır. Türkçe ya da İngilizce yazabilirsin.

## Başlamadan önce

- Büyük bir değişiklik düşünüyorsan önce bir issue açıp konuşalım.
- Güvenlik açıkları için issue açma; [SECURITY.md](SECURITY.md) adımlarını izle.

## Geliştirme

Kurulum için [README](README.md#yerelde-çalıştırma). Pull request göndermeden önce:

```bash
cd apps/api && npm run typecheck && npm test
cd apps/mobile && npx tsc --noEmit && npx expo lint
cd e2e && npx playwright test
```

- Arayüz metinleri Türkçedir; yeni metinleri de Türkçe yaz.
- Para tutarları her yerde kuruş cinsinden tamsayıdır.
- Veritabanı şeması değiştiyse `npm run db:generate` ile migration üret ve onu da ekle.
- Yeni bir API ucu ekliyorsan kaydın isteği yapan kişiye ait olduğunu kontrol et ve bir test yaz.
- Gerçek kişisel ya da finansal veri (isim, IBAN, kart numarası, banka dökümü) depoya, testlere ya da issue'lara koyma.
