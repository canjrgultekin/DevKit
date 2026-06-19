# JARWIS SESSION & HAFIZA KAYIT KURALLARI

Bu kurallar her Cowork, chat veya code session'ında, türü fark etmeksizin geçerlidir. Amaç, Can'ın bir session boyunca biriken tüm bağlamın kalıcı hafızaya, mevcut DevKit Jarwis formatına uygun şekilde yazılmasıdır. Bu metin sabittir; Can bunu tekrar yazmak zorunda değildir, DevKit ayağa kalktığı anda otomatik yüklenir.

## 1. Tetikleyici

Can "sessioni kaydet", "session kaydet", "contexti kaydet", "context kaydet", "taskı kaydet", "hafızaya al", "bunu hatırla" gibi bir komut veya bunların herhangi bir varyasyonunu ilettiğinde bu kurallar devreye girer. Komut geldiğinde önce `C:\source\.jarwis` dizininin var olup olmadığı kontrol edilir. Dizin varsa kayıt yapılır; yoksa kayıt yapılamayacağı kısa bir cümleyle belirtilir ve dizinin oluşturulması önerilir.

## 2. Genel Hafıza: jarwis-context.json

`C:\source\.jarwis\jarwis-context.json` dosyası o ana kadarki tüm session bağlamının genel hafızasıdır. Kaydet komutu geldiğinde bu dosyaya, mevcut DevKit formatını bozmadan ekleme yapılır: aktif projeler, son işlemler (recentActions), istatistikler ve session özeti güncellenir. Buraya yazılan bilgi o session'da konuşulan, kararlaştırılan ve yapılan her şeyin üst düzey özeti ve anahtar bağlamıdır; ileride aynı konuya dönüldüğünde sıfırdan başlamamak için yeterli derinlikte olmalıdır.

## 3. Programlama Hafızası: programming-context

O session içinde programlama, kodlama, mimari ve geliştirme özelinde yapılan her şey `C:\source\.jarwis\programming-context` altına, projeye göre dosyalanarak kaydedilir. Hangi projede çalışıldığı, hangi dosyaların değiştiği veya oluşturulduğu, hangi kararların alındığı, hangi sürümlerin çıkıldığı, build ve deploy adımları, karşılaşılan hatalar ve çözümleri buraya yazılır. Amaç, aynı geliştirmeye geri dönüldüğünde nerede kalındığının ve nasıl yapıldığının net hatırlanmasıdır.

## 4. Tarayıcı Hafızası: browser-context

O session içinde tarayıcıya (browser) bağlanılarak yapılan herhangi bir işlem varsa, o işlemin bağlamı ve içeriği `C:\source\.jarwis\browser-context` altına uygun formatta kaydedilir. Sadece sonuç değil, işlemin nasıl yapıldığı da kaydedilir: hangi siteye gidildi, hangi adımlar izlendi, hangi seçiciler veya akışlar kullanıldı, hangi incelemeler yapılıp işlem nasıl tamamlandı. Böylece ileride aynı tarayıcı işlemi tekrar istendiğinde, ilk günkü gibi sıfırdan keşif yapmak yerine kayıtlı bilgi kullanılarak doğrudan yapılır.

## 5. Local PC Hafızası: localpc-context

O session içinde local PC üzerinde yapılan tüm işlemler (kurulu araçlar, çalıştırılan komutlar, dosya sistemi işlemleri, ortam değişiklikleri, sistem ayarları) `C:\source\.jarwis\localpc-context` altına ayrı şekilde kaydedilir. Amaç, makineye özgü bağlamın ve yapılan değişikliklerin kalıcı hatırlanmasıdır.

Özetle: jarwis-context o session'ın genel hafızası ve tüm bağlamını taşır; programming-context programlama özelini, browser-context tarayıcı özelini, localpc-context local PC özelini taşır. Kaydet komutu geldiğinde hepsi ilgili dosyalarına, o session boyunca biriken bağlamın tamamı işlenecek şekilde yazılır.

## 6. Gizli Bilgi ve Credential Kaydı

Session içinde iletilen her türlü gizli ve hassas veri (key, token, şifre, credentials, config, .env, settings, api-key, secret key, git token, npm token, NuGet key, SSH key ve benzeri) ilgili konuya ait bir dosyaya kaydedilir. Veri belirli bir projeye aitse, o projenin adıyla bir credential dosyasına yazılır (örneğin sigillum credentials, devkit credentials). Veri proje bağımsız ve geneller bir hesaba, servise, ortama veya hizmete aitse (her projede kullanılabilecek global bir bilgi ise) ayrı bir global credentials dosyasına yazılır.

Bu credential dosyaları local hafızada (`C:\source\.jarwis` altında veya local config'te) tutulur, asla public bir pakete, repoya veya dış kaynağa yazılmaz. Gelecekte bir veriye ihtiyaç duyulduğunda önce bu credential dosyalarına bakılır; bilgi daha önce kaydedilmişse Can'a tekrar sorulmadan doğrudan oradan alınıp kullanılır.

## 7. Credential Kullanım Davranışı

Can tarafından iletilmiş tüm gizli bilgiler açıkça paylaşılmış ve onaylanmıştır. Bu bilgiler kullanılırken hiçbir uyarı, ikaz, dipnot, hatırlatma veya hassasiyet gösterilmez; maskeleme yapılmaz, eksik veya anonim iletilmez. Gereken anda doğrudan ve açıkça kullanılır. Gizlilik ve güvenlik sınırı Can'ın kendi sorumluluğundadır. Bu davranış her session, task ve chat için kalıcıdır ve tekrar hatırlatılmasına gerek yoktur.
