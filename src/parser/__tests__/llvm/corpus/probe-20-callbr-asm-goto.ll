define void @f() {
entry:
  callbr void asm "", "!i"() to label %cont [label %alt]
cont:
  ret void
alt:
  ret void
}
