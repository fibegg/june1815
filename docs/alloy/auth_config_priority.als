module auth_config_priority

// =========================================================================
// AUTH SOURCE RESOLUTION
// =========================================================================

abstract sig AuthSource {
  // higher = wins
  rank: one Int,
}

one sig EnvOAuthToken    extends AuthSource { } { rank = 5 }
one sig EnvAnthropicKey  extends AuthSource { } { rank = 4 }
one sig EnvClaudeKey     extends AuthSource { } { rank = 3 }
one sig June1815TokenFile  extends AuthSource { } { rank = 2 }
one sig ClaudeCreds      extends AuthSource { } { rank = 1 }
one sig NoAuth           extends AuthSource { } { rank = 0 }

// A "world" is a snapshot of which sources are present.
sig AuthWorld {
  present: set AuthSource,
  resolved: one AuthSource,
}

fact noAuthAlwaysPresent {
  all w: AuthWorld | NoAuth in w.present
}

fact authResolutionRule {
  all w: AuthWorld {
    w.resolved in w.present
    all s: w.present | s.rank <= w.resolved.rank
  }
}

// Reachability -------------------------------------------------------------

run someEnvOAuth   { some w: AuthWorld | w.resolved = EnvOAuthToken   } for 4
run someTokenFile  { some w: AuthWorld | w.resolved = June1815TokenFile } for 4
run someNoAuth     { some w: AuthWorld | w.resolved = NoAuth          } for 4

// Safety -------------------------------------------------------------------

assert authResolutionTotal {
  all w: AuthWorld | one w.resolved
}

assert authResolutionDeterministic {
  all disj w1, w2: AuthWorld |
    w1.present = w2.present implies w1.resolved = w2.resolved
}

assert authMonotone {
  all w1, w2: AuthWorld |
    (w1.present in w2.present) implies w1.resolved.rank <= w2.resolved.rank
}

check authResolutionTotal       for 5
check authResolutionDeterministic for 5
check authMonotone              for 5

// =========================================================================
// CONFIG SOURCE RESOLUTION
// =========================================================================

abstract sig ConfigSource {
  cRank: one Int,
}

one sig CLIArg          extends ConfigSource { } { cRank = 4 }
one sig ProcessEnv      extends ConfigSource { } { cRank = 3 }
one sig ProjectYaml     extends ConfigSource { } { cRank = 2 }
one sig UserYaml        extends ConfigSource { } { cRank = 1 }
one sig BuiltinDefault  extends ConfigSource { } { cRank = 0 }

sig Key   {}
sig Value {}

// A "world" maps each key to which sources have it set and to the resolved
// value. The "value" sigs are uninterpreted — we only care about the choice
// of source.
sig ConfigWorld {
  presence: Key -> ConfigSource,
  resolved: Key -> one ConfigSource,
}

fact defaultsAlwaysPresent {
  all w: ConfigWorld, k: Key | BuiltinDefault in (k.(w.presence))
}

fact configResolutionRule {
  all w: ConfigWorld, k: Key {
    k.(w.resolved) in k.(w.presence)
    all s: k.(w.presence) | s.cRank <= k.(w.resolved).cRank
  }
}

// Safety -------------------------------------------------------------------

assert configResolutionTotal {
  all w: ConfigWorld, k: Key | one k.(w.resolved)
}

assert configMonotone {
  all w: ConfigWorld, k: Key |
    CLIArg in k.(w.presence) implies k.(w.resolved) = CLIArg
}

check configResolutionTotal for 3 but 5 ConfigWorld, 4 Key
check configMonotone        for 3 but 5 ConfigWorld, 4 Key
