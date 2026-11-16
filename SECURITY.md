# Güvenlik

## Açık bildirme

Bir güvenlik açığı bulduysan lütfen herkese açık issue açma. GitHub'da bu deponun **Security › Report a vulnerability** sayfasından gizli bildirim gönder. Bildirimi aldığımızı birkaç gün içinde yanıtlar, düzeltme yayımlanana kadar ayrıntıları gizli tutarız.

Please do not open public issues for security problems. Use **Security › Report a vulnerability** on GitHub to send a private report.

## Uygulamadaki önlemler

- **Oturumlar:** 32 baytlık rastgele anahtarlar; veritabanında yalnızca SHA-256 özeti tutulur. Şifre değişince diğer oturumlar, sıfırlanınca tüm oturumlar kapanır.
- **Şifreler:** bcrypt. Sıfırlama bağlantıları 256 bit, tek kullanımlık ve 1 saat geçerlidir.
- **Sosyal giriş:** Apple ve Google kimlik anahtarlarının imzası, yayıncısı ve hedefi doğrulanır. E-posta sahipliği kanıtlanmamış bir hesaba sosyal giriş bağlanırken o hesabın şifresi ve oturumları silinir; böylece başkasının e-postasıyla önceden açılmış bir hesap ele geçirme aracı olamaz.
- **Yetki:** her kayıt, isteği yapan kişiye ya da üyesi olduğu ortak alana göre süzülür. Ortak alandan çıkarılan üyenin davet kodları geçersiz olur; ortak alanı yalnızca sahibi geri yükleyebilir.
- **Sınırlar:** giriş, kayıt, şifre sıfırlama, misafir hesabı, davet ve saat eşleştirme uçlarında istek sınırı; istek gövdesi 1 MB (yedek geri yükleme 25 MB).
- **Web:** Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, HSTS ve izin politikası (`apps/mobile/security-headers.conf`).
- **CSV dışa aktarma:** `=`, `+`, `-`, `@` ile başlayan notlar formül olarak çalışmasın diye kaçışlanır.
- **Hata takibi:** Sentry'ye yalnızca yol ve yöntem gönderilir; kişisel veri gönderilmez.

## Kendi sunucunda çalıştırırken

- **Ters vekil ve IP adresi:** İstek sınırları istemci IP'sini `X-Forwarded-For` başlığının ilk değerinden okur. Önündeki ters vekil (Traefik, Caddy vb.) istemciden gelen `X-Forwarded-For` başlığını silip kendisi yazmalı; aksi halde sınırlar atlatılabilir. API'yi doğrudan internete açma, yalnızca `web` servisini aç.
- **E-posta:** `SMTP_URL` tanımlı değilse şifre sıfırlama bağlantıları API günlüğüne yazılır. Günlüklere erişen herkes bu bağlantıları görebileceği için üretimde SMTP tanımla.
- **Geliştirici aboneliği:** `ALLOW_DEV_BILLING=1` üretimde tanımlanmamalı; herkesin kendine Kumbara+ açmasına izin verir.
- **Varsayılan şifre:** `docker compose` ayarsız çalışsın diye veritabanı şifresi varsayılan olarak `kumbara`dır. Veritabanı dışarı açılmaz ama internete açık her kurulumda `POSTGRES_PASSWORD` değiştirilmelidir.
- **Gizli dosyalar:** `.env`, `google-services.json` ve Firebase hizmet hesabı anahtarları depoya eklenmez (`.gitignore`). EAS derlemelerinde gizli dosya değişkenleri kullan.
