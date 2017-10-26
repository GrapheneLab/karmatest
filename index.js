const {Apis, ChainConfig} = require("karmajs-ws");
const {ChainStore, FetchChain, PrivateKey, key, TransactionHelper, Aes, TransactionBuilder} = require("karmajs");
const request = require('request-promise-native');

var adminPrivKey = PrivateKey.fromWif("5KjYXPnNoxjxUkgENSPMpm6SjrHB1XPV9XxiLzbX8swX8Y3rKT1");
let adminPubKey = adminPrivKey.toPublicKey().toString();

function generateKeyFromPassword(accountName, role, password)
{
    let seed = accountName + role + password;
    let privKey = PrivateKey.fromSeed(seed);
    let pubKey = privKey.toPublicKey().toString();

    return {privKey, pubKey};
}

let registerNewUser = async function(account, password) {
    // Register new account via faucet
    let {pubKey} = generateKeyFromPassword(
        account,
        'active',
        password
    );
    console.log(pubKey);

    let result = await request({
        method: 'POST',
        uri: 'http://94.130.89.239:9090/api/v1/accounts',
        json: {
            account: {
                name:account,
                owner_key:pubKey,
                active_key:pubKey,
                memo_key:pubKey,
                refcode:null,
                referrer:null
            }
        }
    });

    console.log('FAUCET:', result);

};


let run = async function run() {
    let account = 'testaccount' + Math.floor(new Date() / 1000);
    let password = 'password';
    await registerNewUser(account, password);

    let res = await Apis.instance("ws://94.130.89.239:8090", true).init_promise;
    console.log('Connected to:', res[0].network.chain_id);
    await ChainStore.init();

    // transfer https://github.com/bitshares/bitsharesjs/blob/master/examples/transfer.js

    let fromAccount = "nathan";
    let memoSender = fromAccount;
    let memo = "Testing transfer from node.js";

    let toAccount = account;

    let sendAmount = {
        amount: 10,
        asset: "KRM"
    };

    Promise.all([
        FetchChain("getAccount", fromAccount),
        FetchChain("getAccount", toAccount),
        FetchChain("getAccount", memoSender),
        FetchChain("getAsset", sendAmount.asset),
        FetchChain("getAsset", sendAmount.asset)
    ]).then((res) => {
        // console.log("got data:", res);
        let [fromAccount, toAccount, memoSender, sendAsset, feeAsset] = res;

        console.log('XXX:', JSON.stringify(toAccount));

        // Memos are optional, but if you have one you need to encrypt it here
        let memoFromKey = memoSender.getIn(["options", "memo_key"]);
        console.log("memo pub key:", memoFromKey);
        let memoToKey = toAccount.getIn(["options", "memo_key"]);
        let nonce = TransactionHelper.unique_nonce_uint64();

        let memo_object = {
            from: memoFromKey,
            to: memoToKey,
            nonce,
            message: Aes.encrypt_with_checksum(
                adminPrivKey,
                memoToKey,
                nonce,
                memo
            )
        };

        let tr = new TransactionBuilder();

        tr.add_type_operation("credit_request_operation", {
            fee: {
                amount: 0,
                asset_id: feeAsset.get("id")
            },
            from: fromAccount.get("id"),
            to: toAccount.get("id"),
            amount: {amount: sendAmount.amount, asset_id: sendAsset.get("id")},
            memo: memo_object
        });

        tr.set_required_fees().then(() => {
            tr.add_signer(adminPrivKey, adminPubKey);
            console.log("serialized transaction:", tr.serialize());
            tr.broadcast();
        })
    });
};

run();
