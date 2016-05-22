/* global describe,it */
'use strict'
let should = require('should')
let asink = require('asink')
let Agent = require('../../lib/agent.js')
let Wallet = require('../../lib/wallet.js')
let SpendingRevokedTxo = require('../../lib/txs/spending-revoked-txo.js')

let PrivKey = require('yours-bitcoin/lib/priv-key')
let PubKey = require('yours-bitcoin/lib/pub-key')
let Bn = require('yours-bitcoin/lib/bn')
let TxVerifier = require('yours-bitcoin/lib/tx-verifier')
let Interp = require('yours-bitcoin/lib/interp')
let TxOutMap = require('yours-bitcoin/lib/tx-out-map')

describe('SpendingRevokedTxo', function () {
  it('should exist', function () {
    should.exist(SpendingRevokedTxo)
    should.exist(new SpendingRevokedTxo())
  })

  describe('#asyncBuild', function () {
    it('should create spending tx', function () {
      return asink(function *() {
        // each party initializes itself locally
        let alice = new Agent('Alice')
        yield alice.asyncInitialize(PrivKey.fromRandom(), PrivKey.fromRandom(), PrivKey.fromRandom())
        let bob = new Agent('Bob')
        yield bob.asyncInitialize(PrivKey.fromRandom(), PrivKey.fromRandom(), PrivKey.fromRandom())

        // right now Alice and Bob communicate by storing a reference to one another
        // eventually this will be replaced by some form of remote proceedure calls
        alice.remoteAgent = bob
        bob.remoteAgent = alice

        // Alice opens a channel to bob
        alice.funder = true
        bob.funder = false
        let publicAlice = yield alice.asyncToPublic()
        yield bob.asyncOpenChannel(Bn(1e6), publicAlice)

        // alice sends some funds to bob
        alice.sender = true
        bob.sender = false
        yield bob.asyncSend(Bn(4e5), Bn(6e5), alice.nextRevocationSecret.toPublic())

        // send a secod payment, this revokes the first payment
        yield bob.asyncSend(Bn(3e5), Bn(7e5), alice.nextRevocationSecret.toPublic())


        let txVerifier, error, commitmentTxo, txOutMap

        // once Bob's commitment tranaction is on the blockchain, he can spend his output like this:
        commitmentTxo = alice.commitmentTxos[0]
        let bobsSpendingTxo = new SpendingRevokedTxo()
        yield bobsSpendingTxo.asyncBuild(commitmentTxo, bob.spending)

        should.exist(bobsSpendingTxo)

        txOutMap = new TxOutMap()
        txOutMap.addTx(commitmentTxo.txb.tx)
        txVerifier = new TxVerifier(bobsSpendingTxo.txb.tx, txOutMap)
        error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
        if (error) {
          console.log(txVerifier.interp.getDebugString())
        }
        error.should.equal(false)

        // same test for alice
        commitmentTxo = alice.commitmentTxos[0]
        let alicesSpendingTxo = new SpendingRevokedTxo()
        yield alicesSpendingTxo.asyncBuild(commitmentTxo, alice.spending)

        should.exist(alicesSpendingTxo)
        txOutMap = new TxOutMap()
        txOutMap.addTx(commitmentTxo.txb.tx)
        txVerifier = new TxVerifier(alicesSpendingTxo.txb.tx, txOutMap)
        error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
        if (error) {
          console.log(txVerifier.interp.getDebugString())
        }
        error.should.equal(false)
      }, this)
    })
  })
})
