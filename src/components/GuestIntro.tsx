type GuestIntroProps = {
  mode: 'image' | 'video'
  onSignIn: () => void
}

import './guest-intro.css'

const ASSETS = {
  upload: '/media/guest-step-upload.avif?v=20260307-1',
  output: '/media/guest-step-length-14.mp4?v=20260307-1',
}

const EDIT_SHOWCASE = {
  main: '/media/sparkart-edit-main-20260307.avif?v=20260307-1',
  reference: '/media/sparkart-edit-reference-20260307.webp?v=20260307-1',
  result: '/media/sparkart-edit-result-20260307.png?v=20260307-1',
}

const EDIT_SHOWCASE_PROMPT = 'メイン画像の女と参考画像の女がキス'
const EDIT_SHOWCASE_ANGLE = 'アングル　上30度　中距離'
const GALLERY_ITEMS = [
  {
    src: '/media/sparkart-gallery-angle-down30.png?v=20260307-1',
    label: 'アングル下30度の例',
    alt: 'アングル下30度の生成例',
  },
  {
    src: '/media/sparkart-gallery-combo.png?v=20260307-1',
    label: '別の画像と組み合わせた例',
    alt: '別の画像と組み合わせた生成例',
  },
]

const HERO_ORBIT_VIDEOS = [
  '/media/sparkart-orbit-19.mp4?v=20260307-4',
  '/media/sparkart-orbit-18.mp4?v=20260307-4',
  '/media/sparkart-orbit-16.mp4?v=20260307-4',
  '/media/sparkart-orbit-15.mp4?v=20260307-4',
  '/media/sparkart-orbit-14.mp4?v=20260307-4',
  '/media/sparkart-orbit-13.mp4?v=20260307-4',
  '/media/sparkart-orbit-12.mp4?v=20260307-4',
  '/media/sparkart-orbit-11.mp4?v=20260307-4',
]

const ENGINE_FEATURES = [
  {
    name: 'SparkMotion',
    description: '動画生成、画像編集が可能なSparkArtのベースモデルサイト。安定した生成が特徴です。',
  },
  {
    name: 'SparkArt',
    description: 'SparkMotionを改良した新モデルを搭載したサイト。動きの多さが特徴です。',
  },
]

const HOW_TO_USE_STEPS = [
  {
    no: '01',
    title: 'アカウントの登録',
    body: 'サービスを利用するには無料会員登録が必要です。10秒で終わります。登録するだけで5回分の生成コインが付与されます。',
  },
  {
    no: '02',
    title: '動画にしたいお好みの画像を用意',
    body: '写真でもイラストでも変換可能です。',
  },
  {
    no: '03',
    title: 'お好みのプロンプトを設定',
    body: '英語や日本語、中国語で自由に設定できます。',
  },
  {
    no: '04',
    title: '画像を変換',
    body: '最後に「生成」ボタンをクリックするだけです。',
  },
]

const USER_VOICES = [
  {
    comment: '一瞬で動画が生成されちゃう！ 魔法みたいな体験！',
    profile: '30代男性',
  },
  {
    comment: 'やみつきになっちゃう楽しさ・・。毎日お世話になってます！',
    profile: '20代男性',
  },
  {
    comment: 'AIすごい！夢でしか見れないような光景がここだとすぐ見れちゃう。',
    profile: '50代男性',
  },
  {
    comment: 'ログインボーナスがあるので毎日の日課になってしまってます。',
    profile: '30代男性',
  },
  {
    comment: '自分の理想の動画が作れる！',
    profile: '20代男性',
  },
  {
    comment: '推しの画像をかわいく動かしてます。',
    profile: '40代男性',
  },
]

export function GuestIntro({ mode: _mode, onSignIn }: GuestIntroProps) {
  return (
    <div className='pulse-landing'>
      <section className='nova-hero nova-hero--fullbleed'>
        <div className='nova-hero__inner'>
          <div className='nova-hero__copy'>
            <h1>Spark Art</h1>
            <p>
              動画画像生成に特化したAIスタジオです。
              1枚の画像をもとに、6秒の動画やアングル違いの画像をすぐ作成できます。
            </p>
            <div className='nova-auth-buttons'>
              <button type='button' className='primary-button primary-button--glow primary-button--pink' onClick={onSignIn}>
                Googleログイン
              </button>
            </div>
          </div>

          <div className='nova-hero__visual'>
            <div className='nova-object' aria-hidden='true'>
              <div className='nova-ring'>
                {HERO_ORBIT_VIDEOS.map((src, faceIndex) => (
                  <div key={`orbit-face-${faceIndex}-${src}`} className='nova-face'>
                    <video src={src} autoPlay loop muted playsInline preload='metadata' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className='pulse-flow'>
        <div className='pulse-flow__row'>
          <div className='pulse-flow__text'>
            <p>01</p>
            <h2>画像をアップロード</h2>
            <strong>元画像を1枚選ぶだけで開始できます。</strong>
          </div>
          <div className='pulse-flow__media'>
            <img src={ASSETS.upload} alt='画像アップロードの説明画像' loading='lazy' />
          </div>
        </div>

        <div className='pulse-flow__row pulse-flow__row--reverse'>
          <div className='pulse-flow__text'>
            <p>02</p>
            <h2>長さは6秒</h2>
            <strong>6秒動画を生成します。プロンプトで動きを決められます。</strong>
          </div>
          <div className='pulse-flow__media'>
            <video src={ASSETS.output} autoPlay loop muted playsInline preload='metadata' />
          </div>
        </div>
      </section>

      <section className='sparkart-edit-promo'>
        <div className='sparkart-edit-promo__copy'>
          <p className='sparkart-edit-promo__kicker'>圧倒的な画像編集機能</p>
          <h2>1枚または2枚の画像と1行の指示で、狙った編集結果を一発生成</h2>
          <p>
            Spark ArtのImage Editは、メイン画像と参考画像の特徴を保ちながら、プロンプトどおりの構図へ強力に変換します。さらにアングルやショットも自由自在に変更可能です。
          </p>
          <div className='sparkart-edit-promo__prompt'>
            <span>実際の入力プロンプト</span>
            <strong>{EDIT_SHOWCASE_PROMPT}</strong>
            <p className='sparkart-edit-promo__shot'>{EDIT_SHOWCASE_ANGLE}</p>
          </div>
        </div>

        <div className='sparkart-edit-promo__grid'>
          <figure className='sparkart-edit-promo__card'>
            <img src={EDIT_SHOWCASE.main} alt='メイン画像サンプル' loading='lazy' />
            <figcaption>メイン画像</figcaption>
          </figure>
          <figure className='sparkart-edit-promo__card'>
            <img src={EDIT_SHOWCASE.reference} alt='参考画像サンプル' loading='lazy' />
            <figcaption>参考画像</figcaption>
          </figure>
          <figure className='sparkart-edit-promo__card sparkart-edit-promo__card--result'>
            <img src={EDIT_SHOWCASE.result} alt='画像編集の生成結果' loading='lazy' />
            <figcaption>生成結果</figcaption>
          </figure>
        </div>
      </section>

      <section className='sparkart-gallery'>
        <div className='sparkart-gallery__head'>
          <p>GALLERY</p>
          <h2>生成ギャラリー</h2>
        </div>
        <div className='sparkart-gallery__grid'>
          {GALLERY_ITEMS.map((item) => (
            <figure key={item.label} className='sparkart-gallery__card'>
              <img src={item.src} alt={item.alt} loading='lazy' />
              <figcaption>{item.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className='pulse-faq'>
        <div className='pulse-faq__head'>
          <h2>Spark Artでできること</h2>
          <p>
            動き重視または安定重視で2つの動画スタイルを用途に合わせて使い分けできます。
            <br />
            SparkArtの動画エンジンはSparkMotionの動画エンジンに改良を加えた独自モデルです。
          </p>
        </div>
        <div className='pulse-faq__grid'>
          {ENGINE_FEATURES.map((item) => (
            <article key={item.name} className='pulse-faq__item'>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='sparkart-qa'>
        <div className='sparkart-qa__head'>
          <p>SparkMotion / SparkArt</p>
          <h2>Q&A</h2>
        </div>

        <div className='sparkart-qa__bubble sparkart-qa__bubble--q'>
          <span>Q</span>
          <p>SparkArtとSparkMotionの大きな違いは何ですか？</p>
        </div>

        <div className='sparkart-qa__bubble sparkart-qa__bubble--a'>
          <span>A</span>
          <p>
            どちらもそれぞれ特徴があります。SparkMotionは動画の安定感に強みがあり、SparkArtはより多機能なモデルで自由度が高いです。
          </p>
        </div>

        <a
          className='sparkart-qa__link'
          href='https://sparkmotion.work/'
          target='_blank'
          rel='noreferrer'
        >
          SparkMotionを見る
        </a>
      </section>

      <section className='pulse-faq'>
        <div className='pulse-faq__head'>
          <p>HOW TO USE</p>
          <h2>動画を生成するには</h2>
        </div>
        <div className='pulse-faq__grid'>
          {HOW_TO_USE_STEPS.map((step) => (
            <article key={step.no} className='pulse-faq__item'>
              <h3>{step.no}</h3>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='pulse-faq'>
        <div className='pulse-faq__head'>
          <p>USERS VOICE</p>
          <h2>ユーザーの声</h2>
        </div>
        <div className='pulse-faq__grid'>
          {USER_VOICES.map((voice, index) => (
            <article key={voice.profile + '-' + index} className='pulse-faq__item'>
              <h3>{voice.comment}</h3>
              <p>{voice.profile}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='pulse-legal'>
        <article className='pulse-legal__card'>
          <h2>利用規約（要約）</h2>
          <p>
            本サービスは、ユーザーがアップロードした画像と入力したプロンプトをもとに動画を生成するオンラインサービスです。
            ユーザーは、法令・公序良俗に反する利用、第三者の著作権・肖像権・商標権などの権利を侵害する利用、
            不正アクセスやシステム妨害行為を行ってはなりません。生成機能の利用にはコインが必要であり、
            消費条件・付与条件は運営が定めるルールに従います。デジタルサービスの性質上、購入後のキャンセル・返金は
            原則として受け付けません（運営側の不具合を除く）。禁止行為または規約違反が確認された場合、
            運営は事前通知なく利用制限・アカウント停止等の措置を実施することがあります。
            また、サービス内容・料金・提供条件は予告なく変更または停止される場合があります。
          </p>
        </article>
        <article className='pulse-legal__card'>
          <h2>プライバシーポリシー（要約）</h2>
          <p>
            本サイト自体では個人情報を直接取得・保存しません。
            ログイン・決済などの処理は外部サービス（認証/決済基盤）を通じて実施され、
            各データの取り扱いはそれぞれの提供元ポリシーに準拠します。
          </p>
        </article>
      </section>
    </div>
  )
}


