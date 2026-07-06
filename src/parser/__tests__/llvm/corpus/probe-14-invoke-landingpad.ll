define void @f() personality i8* bitcast (i32 (...)* @__gxx_personality_v0 to i8*) {
entry:
  invoke void @g() to label %cont unwind label %lpad
cont:
  ret void
lpad:
  %lp = landingpad { i8*, i32 } cleanup
  resume { i8*, i32 } %lp
}
declare void @g()
declare i32 @__gxx_personality_v0(...)
