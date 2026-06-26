import { Link } from 'react-router-dom'
import './camera.css'

const rows = [
  ['販売事業者', '要請があれば開示します'],
  ['運営責任者', '要請があれば開示します'],
  ['所在地', '要請があれば開示します'],
  ['電話番号', '要請があれば開示します'],
  ['販売URL', 'https://sparkart.work/'],
  ['サービス内容', 'AIによる画像生成、画像編集、動画生成機能を利用できるデジタルサービスです。'],
  ['販売価格', '購入画面に表示される金額です。表示価格は税込です。'],
  ['商品代金以外の必要料金', 'インターネット接続料金、通信料金、振込手数料等はお客様の負担となります。'],
  ['支払方法', 'クレジットカード決済、その他決済代行サービスが提供する支払方法。'],
  ['支払時期', '各決済サービスの定める時期に課金されます。'],
  ['サービス提供時期', '決済完了後、通常ただちにアカウントへコインが付与され、サービスを利用できます。'],
  ['販売数量の制限', '購入プランごとに付与されるコイン数が異なります。販売数量に制限がある場合は購入画面に表示します。'],
  ['返品・キャンセル', 'デジタルサービスの性質上、購入後のお客様都合による返品、キャンセル、返金は原則としてお受けできません。'],
  ['不具合時の対応', '当方の責めに帰すべき不具合によりコインが消費された場合、確認のうえコイン返却等の対応を行います。'],
  ['動作環境', '最新版のGoogle Chrome、Microsoft Edge、Safari等の主要ブラウザでの利用を推奨します。'],
  ['表現および再現性', 'AI生成サービスの性質上、生成結果の品質、内容、完全な再現性、特定の結果を保証するものではありません。'],
  ['禁止事項', '法令または公序良俗に反する利用、第三者の権利を侵害する利用、不正アクセス、システム妨害行為を禁止します。'],
  ['問い合わせ受付時間', '10:00〜18:00（土日祝日、年末年始を除く）'],
]

export function LegalNotice() {
  return (
    <main className='legal-notice-page'>
      <section className='legal-notice-card'>
        <div className='legal-notice-head'>
          <p>LEGAL NOTICE</p>
          <h1>特定商取引法に基づく表記</h1>
          <span>最終更新日: 2026年6月27日</span>
        </div>

        <div className='legal-notice-table'>
          {rows.map(([label, value]) => (
            <div className='legal-notice-row' key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </div>

        <section className='legal-notice-section'>
          <h2>免責事項</h2>
          <p>
            本サービスはAI生成技術を利用した創作支援サービスです。生成結果の正確性、適法性、完全性、
            特定目的への適合性を保証するものではありません。ユーザーは生成結果を利用する前に、
            権利関係、利用用途、公開可否を自身の責任で確認してください。
          </p>
        </section>

        <section className='legal-notice-section'>
          <h2>利用制限について</h2>
          <p>
            禁止行為、法令違反、決済不正、第三者権利侵害、システムへの過度な負荷が確認された場合、
            事前通知なくサービス利用の停止、アカウント制限、コイン利用制限等を行うことがあります。
          </p>
        </section>

        <div className='legal-notice-actions'>
          <Link className='primary-button' to='/'>
            トップへ戻る
          </Link>
        </div>
      </section>
    </main>
  )
}
