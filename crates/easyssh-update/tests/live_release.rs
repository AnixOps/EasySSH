//! The published release end to end: fetch the Linux feed, verify it, then
//! download its installer and verify that too, the way "Update and restart"
//! does. Needs the network, so it only runs when asked:
//!
//!     EASYSSH_UPDATE_LIVE_KEY=<public key> cargo test -p easyssh-update --test live_release -- --ignored

use easyssh_update::{download, feed_url, Fetch, Http, Verifier};

#[test]
#[ignore = "downloads the latest release"]
fn the_latest_release_downloads_and_verifies() {
    let key = std::env::var("EASYSSH_UPDATE_LIVE_KEY").expect("EASYSSH_UPDATE_LIVE_KEY");
    let product = "anixops-ssh-linux";
    let verifier = Verifier::new(product, &[key.as_str()]).unwrap();
    let body = Http.get(&feed_url(product)).unwrap();
    let feed = verifier.verify_feed(&body, 0).unwrap();
    let item = feed.items.first().expect("an item");
    let mut file = tempfile::tempfile().unwrap();
    let mut seen = 0;
    download(&item.url, &mut file, item.length as u64, |done| {
        seen = done;
        true
    })
    .unwrap();
    assert_eq!(seen, item.length as u64);
    use std::io::Seek;
    file.rewind().unwrap();
    verifier.verify_archive(&file, item).unwrap();
}
